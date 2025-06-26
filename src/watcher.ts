import { KeyedListPatcher } from "./patcher";

function evalInContext(expr: string, context: any) {
  return Function(...Object.keys(context), `return ${expr}`)(...Object.values(context));
}

function getDeepValue(obj: any, path: string): any {
  return path.split(".").reduce((o, k) => (o ? o[k] : ""), obj);
}

export class Watcher {
  watchCallbacks: Map<string | symbol, ((value: any) => void)[]>;
  host: any;

  constructor(host: any) {
    this.watchCallbacks = new Map();
    this.host = host;
  }

  onNode(node: Node) {
    if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
      Array.from(node.childNodes).forEach((child) => this.onNode(child));
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      this.onElement(node as Element);
    } else if (node.nodeType === Node.TEXT_NODE) {
      this.onText(node);
    }
  }

  onElement(node: Element) {
    if (node.nodeName === "TEMPLATE") {
      const attrs = Array.from(node.attributes);
      const templateContent = (node as HTMLTemplateElement).content;

      for (const attr of attrs) {
        const name = attr.nodeName;
        const value = attr.nodeValue;
        const match = value?.match(/\{\{(.+?)\}\}/);
        if (!match) continue;
        const expression = match[1].trim();

        if (name === "if") {
          const commentStart = document.createComment("if-start");
          const commentEnd = document.createComment("if-end");
          const children = Array.from(templateContent.cloneNode(true).childNodes);
          node.replaceWith(commentStart, ...(this.host[expression] ? children : []), commentEnd);
          if (this.host[expression]) children.forEach((child) => this.onNode(child));

          let oldValue = !!this.host[expression];
          this.addWatchListener(expression, (value) => {
            value = !!value;
            if (value === oldValue) return;
            oldValue = value;

            const parent = commentStart.parentNode;
            if (!parent) return;

            let current = commentStart.nextSibling;
            while (current && current !== commentEnd) {
              const next = current.nextSibling;
              parent.removeChild(current);
              current = next;
            }

            if (value) {
              const fragment = document.createDocumentFragment();
              const nextChildren = Array.from(templateContent.cloneNode(true).childNodes);
              nextChildren.forEach((child) => {
                this.onNode(child);
                fragment.appendChild(child);
              });
              commentEnd.parentNode.insertBefore(fragment, commentEnd);
            }
          });
          return;
        }
        if (name === "for") {
          const commentStart = document.createComment("for-start");
          const commentEnd = document.createComment("for-end");
          node.replaceWith(commentStart, commentEnd);

          const match = value.match(/\{\{(.+?)\}\}/);
          if (!match) return;

          const raw = match[1].trim();
          let mode: "of" | "in" | "iterator" = "iterator";
          let varName = "",
            sourceExpr = "";

          if (raw.includes(" of ")) {
            [varName, sourceExpr] = raw.split(" of ").map((s) => s.trim());
            mode = "of";
          } else if (raw.includes(" in ")) {
            [varName, sourceExpr] = raw.split(" in ").map((s) => s.trim());
            mode = "in";
          } else {
            sourceExpr = raw;
          }

          const keyAttr = node.getAttribute("key");
          const keyExpr = keyAttr?.match(/\{\{(.+?)\}\}/)?.[1]?.trim();
          const templateContent = (node as HTMLTemplateElement).content;
          const getKey = keyExpr ? (ctx) => evalInContext(keyExpr, ctx) : (ctx) => ctx?.$index;

          const patcher = new KeyedListPatcher(
            (context) => {
              const frag = templateContent.cloneNode(true) as DocumentFragment;
              const subWatcher = new Watcher(context);
              const nodes = Array.from(frag.childNodes);
              nodes.forEach((n) => subWatcher.onNode(n));
              return nodes;
            },
            (context) => {
              if (!keyExpr) throw new Error("missing key expression");
              return getKey(context);
            }
          );

          const render = (source) => {
            if (!source) return;
            const list: { context: any }[] = [];

            if (mode === "of" && Array.isArray(source)) {
              source.forEach((item, index) => {
                const ctx = Object.create(this.host);
                ctx[varName] = item;
                ctx.$index = index;
                list.push({ context: ctx });
              });
            } else if (mode === "in" && typeof source === "object") {
              Object.keys(source).forEach((keyStr, index) => {
                const ctx = Object.create(this.host);
                ctx[varName] = keyStr;
                ctx.$value = source[keyStr];
                ctx.$index = index;
                list.push({ context: ctx });
              });
            } else if (source && typeof source.next === "function") {
              let index = 0;
              let result;
              while (!(result = source.next()).done) {
                const val = result.value;
                const ctx = Object.create(this.host);
                if (typeof val === "object") {
                  ctx.dong = val.dong;
                  ctx.index = val.index ?? index;
                  ctx.value = val.value ?? val;
                } else {
                  ctx.value = val;
                  ctx.index = index;
                }
                list.push({ context: ctx });
                index++;
              }
            }

            patcher.patch(list);
          };

          requestAnimationFrame(() => {
            patcher.mount(commentEnd.parentNode!, commentEnd);
            render(this.host[sourceExpr]);
          });

          this.addWatchListener(sourceExpr, render);
          return;
        }

        if (name === "html") {
          const commentStart = document.createComment("html-start");
          const commentEnd = document.createComment("html-end");
          node.replaceWith(commentStart, commentEnd);

          const render = (htmlString: string) => {
            const parent = commentStart.parentNode;
            if (!parent) return;

            let current = commentStart.nextSibling;
            while (current && current !== commentEnd) {
              const next = current.nextSibling;
              parent.removeChild(current);
              current = next;
            }

            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlString, "text/html");
            const fragment = document.createDocumentFragment();
            Array.from(doc.childNodes).forEach((child) => {
              this.onNode(child);
              fragment.appendChild(child);
            });
            commentEnd.parentNode.insertBefore(fragment, commentEnd);
          };

          render(this.host[expression]);
          this.addWatchListener(expression, render);
          return;
        }
      }

      return;
    }
    const resolvedAttributes = [];
    const { attributes } = node;
    for (let _i = 0; _i < attributes.length; _i++) {
      const { nodeName: name, nodeValue: value } = attributes[_i];
      if (name === "...") {
        // rest properties
        if (_i !== attributes.length - 1) {
          throw new Error("rest properties directive must be the last attribute");
        }

        const match = value.match(/\{\{(.+?)\}\}/);
        const updater = (newValue) => {
          Object.keys(newValue).forEach((key) => {
            if (!resolvedAttributes.includes(key)) {
              node[key] = newValue[key];
            }
          });
        };
        if (match) {
          const expression = match[1].trim();
          const initial = this.host[expression];
          updater(initial);
          this.addWatchListener(expression, updater);
        }
        node.removeAttribute(name);
      }
      resolvedAttributes.push(name);

      if (name.startsWith("@")) {
        /* listener */
        const eventName = name.slice(1);
        const match = value.match(/\{\{(.+?)\}\}/);
        if (match) {
          const expression = match[1].trim();
          const fn = this.host[expression];
          node.addEventListener(eventName, fn.bind(this.host), fn);
        }
        node.removeAttribute(name);
        continue;
      }
      if (name.startsWith(".")) {
        /* property */
        const match = value.match(/\{\{(.+?)\}\}/);
        const updater = (newValue) => {
          node[name.slice(1)] = newValue;
        };
        if (match) {
          const expression = match[1].trim();
          const initial = this.host[expression];
          updater(initial);
          this.addWatchListener(expression, updater);
        }
        node.removeAttribute(name);
        continue;
      }
      if (name.startsWith("?")) {
        /* boolean attribute */
        const qualifiedName = name.slice(1);
        const updater = (value) => {
          if (value) {
            node.setAttribute(qualifiedName, "");
          } else {
            node.removeAttribute(qualifiedName);
          }
        };
        const match = value.match(/\{\{(.+?)\}\}/);
        if (match) {
          const expression = match[1].trim();
          const initial = this.host[expression];

          updater(initial);
          this.addWatchListener(expression, updater);
        } else {
          if (value) {
            console.warn("?directive do not need a value");
            node.setAttribute(qualifiedName, "");
          }
        }
        node.removeAttribute(name);
        continue;
      }
      /* attribute */
      const match = value.match(/\{\{(.+?)\}\}/);
      if (match) {
        const expression = match[1].trim();
        const initial = this.host[expression];
        const updater = (newValue) => {
          node.setAttribute(name, newValue);
        };
        updater(initial);
        this.addWatchListener(expression, updater);
      }
    }
    Array.from(node.childNodes).forEach((child) => this.onNode(child));
  }

  onText(node: Node) {
    const value = node.nodeValue!;
    const reg = /\{\{(.+?)\}\}/g;

    const textTokens: any[] = [];
    const tokenMap: Record<string, number[]> = {};
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = reg.exec(value))) {
      const start = match.index;
      if (start > lastIndex) {
        textTokens.push(value.slice(lastIndex, start));
      }

      const key = match[1].trim();
      const val = getDeepValue(this.host, key);
      const pos = textTokens.length;
      textTokens.push(val);

      tokenMap[key] ??= [];
      tokenMap[key].push(pos);

      lastIndex = start + match[0].length;
    }

    if (lastIndex < value.length) {
      textTokens.push(value.slice(lastIndex));
    }

    node.nodeValue = textTokens.join("");

    for (const key in tokenMap) {
      this.addWatchListener(key, (newVal) => {
        for (const pos of tokenMap[key]) {
          textTokens[pos] = newVal;
        }
        node.nodeValue = textTokens.join("");
      });
    }
  }

  addWatchListener(key: string | symbol, cb: (newValue: any) => void) {
    let callbacks = this.watchCallbacks.get(key);
    if (!callbacks) {
      callbacks = [];
      this.watchCallbacks.set(key, callbacks);
    }
    callbacks.push(cb);
  }

  update(key, newValue) {
    this.watchCallbacks.get(key)?.forEach((cb) => cb(newValue));
  }
}
