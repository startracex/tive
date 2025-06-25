export class Watcher {
  watchCallbacks: Map<string | symbol, ((value: any) => void)[]>;
  host: any;

  constructor(host: any) {
    this.watchCallbacks = new Map();
    this.host = host;
  }

  onNode(node: Node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      this.onElement(node as Element);
    } else if (node.nodeType === Node.TEXT_NODE) {
      this.onText(node);
    }
  }

  onElement(node: Element) {
    if (node.nodeName === "TEMPLATE") {
      for (const attr of node.attributes) {
        const name = attr.nodeName;
        const value = attr.nodeValue;

        if (name === "if") {
          const match = value.match(/\{\{(.+?)\}\}/);
          const expression = match[1].trim();
          const commentStart = document.createComment("");
          const commentEnd = document.createComment("");
          const initial = !!this.host[expression];
          const children = [...(node as HTMLTemplateElement).content.childNodes];

          node.replaceWith(commentStart, ...(initial ? children : []), commentEnd);

          let oldValue = initial;
          const updater = (value) => {
            value = !!value;
            if (oldValue === value) {
              return;
            }
            oldValue = value;
            const startParent = commentStart.parentNode;
            if (value) {
              let previous: ChildNode = commentStart;
              children.forEach((child) => {
                previous.after(child);
                previous = child;
              });
              previous.after(commentEnd);
            } else {
              let current = commentStart.nextSibling;

              // remove start.next to end.previous
              while (current && current !== commentEnd) {
                const next = current.nextSibling;
                startParent.removeChild(current);
                current = next;
              }
            }
          };
          this.addWatchListener(expression, updater);
        }
        if (name === "for") {
          const match = value.match(/\{\{(.+?)\}\}/);
          if (!match) return;

          const [itemVar, iterableExpr] = match[1].split(" in ").map((s) => s.trim());
          const commentStart = document.createComment("");
          const commentEnd = document.createComment("");
          const templateContent = (node as HTMLTemplateElement).content;

          node.replaceWith(commentStart, commentEnd);

          const render = (list) => {
            let current = commentStart.nextSibling;
            while (current && current !== commentEnd) {
              const next = current.nextSibling;
              commentStart.parentNode.removeChild(current);
              current = next;
            }

            list?.forEach((item, index) => {
              const clone = templateContent.cloneNode(true) as DocumentFragment;
              const context = Object.create(this.host);
              context[itemVar] = item;
              context.$index = index;

              const subWatcher = new Watcher(context);
              clone.childNodes.forEach((n) => subWatcher.onNode(n));
              commentEnd.parentNode.insertBefore(clone, commentEnd);
            });
          };

          const expression = iterableExpr;
          const initial = this.host[expression];
          render(initial);
          this.addWatchListener(expression, render);
        }
        if (name === "html") {
          const match = value.match(/\{\{(.+?)\}\}/);
          if (!match) return;

          const expression = match[1].trim();
          const commentStart = document.createComment("");
          const commentEnd = document.createComment("");

          node.replaceWith(commentStart, commentEnd);

          const render = (htmlString: string) => {
            let current = commentStart.nextSibling;
            while (current && current !== commentEnd) {
              const next = current.nextSibling;
              commentStart.parentNode.removeChild(current);
              current = next;
            }

            const temp = document.createElement("div");
            temp.innerHTML = htmlString;
            const fragment = document.createDocumentFragment();
            
            Array.from(temp.childNodes).forEach((child) => fragment.appendChild(child));
            commentEnd.parentNode.insertBefore(fragment, commentEnd);
          };

          render(this.host[expression]);
          this.addWatchListener(expression, render);
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
    node.childNodes.forEach((node) => {
      this.onNode(node);
    });
  }

  onText(node: Node) {
    const value = node.nodeValue;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    const textTokens: any[] = [];
    const tokenMap = {};
    const reg = /\{\{(.+?)\}\}/g;
    while ((match = reg.exec(value))) {
      const startIndex = match.index;
      if (startIndex > lastIndex) {
        textTokens.push(value.slice(lastIndex, startIndex));
      }
      const key = match[1].trim();
      textTokens.push(this.host[key]);
      lastIndex = match.index + match[0].length;
      const pos = textTokens.length - 1;
      tokenMap[key] ??= [];
      tokenMap[key].push(pos);
    }
    if (lastIndex < value.length) {
      textTokens.push(value.slice(lastIndex));
    }
    node.nodeValue = textTokens.join("");

    for (const key in tokenMap) {
      this.addWatchListener(key, (newValue) => {
        if (tokenMap[key]) {
          tokenMap[key].forEach((pos) => {
            textTokens[pos] = newValue;
          });
          node.nodeValue = textTokens.join("");
        }
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
