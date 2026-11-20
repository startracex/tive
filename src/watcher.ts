import type { AttributeRegistry } from "./attributes/registry.js";
import { collectDeps, createContext, evaluateExpression } from "./attributes/registry.js";
import type { ComponentRegistry } from "./components/registry.js";
import { KeyedListPatcher } from "./patcher.js";

function evalInContext(expr: string, context: any) {
  return evaluateExpression(`{{${expr}}}`, context).value;
}

function getDeepValue(obj: any, path: string): any {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function readHost(host: any, expression: string) {
  try {
    return evaluateExpression(`{{${expression}}}`, host).value;
  } catch {
    return host[expression];
  }
}

export class Watcher {
  watchCallbacks: Map<string | symbol, ((value: any) => void)[]>;
  host: any;
  componentRegistry: ComponentRegistry;
  attributeRegistry: AttributeRegistry;

  constructor(
    host: any,
    attributeRegistry: AttributeRegistry,
    componentRegistry: ComponentRegistry,
  ) {
    this.watchCallbacks = new Map();
    this.host = host;
    this.componentRegistry = componentRegistry;
    this.attributeRegistry = attributeRegistry;
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
      this.onTemplate(node as HTMLTemplateElement);
      return;
    }
    if (this.componentRegistry?.createIfComponent(node, this.host, this)) {
      return;
    }
    const attrs = Array.from(node.attributes);
    for (let i = 0; i < attrs.length; i++) {
      this.attributeRegistry.apply(
        node,
        attrs[i],
        createContext({
          host: this.host,
          index: i,
          allAttributes: attrs,
          evaluator: evaluateExpression,
          watchFn: this.addWatchListener.bind(this),
        }),
      );
    }
    Array.from(node.childNodes).forEach((child) => this.onNode(child));
  }

  onTemplate(node: HTMLTemplateElement) {
    const attrs = Array.from(node.attributes);
    const templateContent = node.content;

    for (const attr of attrs) {
      const name = attr.nodeName;
      const value = attr.nodeValue;
      const match = value?.match(/\{\{(.+?)\}\}/);
      if (!match) {
        continue;
      }
      const expression = match[1].trim();

      if (name === "if") {
        this.bindIf(node, templateContent, expression);
        return;
      }
      if (name === "for") {
        this.bindFor(node, templateContent, value!);
        return;
      }
      if (name === "html") {
        this.bindHtml(node, expression);
        return;
      }
    }
  }

  private bindIf(node: HTMLTemplateElement, templateContent: DocumentFragment, expression: string) {
    const commentStart = document.createComment("if-start");
    const commentEnd = document.createComment("if-end");
    const initial = !!readHost(this.host, expression);
    const children = initial ? Array.from(templateContent.cloneNode(true).childNodes) : [];
    node.replaceWith(commentStart, ...children, commentEnd);
    children.forEach((child) => this.onNode(child));

    let oldValue = initial;
    const render = (value: any) => {
      value = !!value;
      if (value === oldValue) {
        return;
      }
      oldValue = value;

      const parent = commentStart.parentNode;
      if (!parent) {
        return;
      }

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
        parent.insertBefore(fragment, commentEnd);
      }
    };

    for (const dep of collectDeps(expression)) {
      this.addWatchListener(dep, () => render(readHost(this.host, expression)));
    }
  }

  private bindFor(node: HTMLTemplateElement, templateContent: DocumentFragment, value: string) {
    const commentStart = document.createComment("for-start");
    const commentEnd = document.createComment("for-end");
    node.replaceWith(commentStart, commentEnd);

    const match = value.match(/\{\{(.+?)\}\}/);
    if (!match) {
      return;
    }

    const raw = match[1].trim();
    let mode: "of" | "in" | "iterator" = "iterator";
    let varName = "";
    let sourceExpr = "";

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
    const getKey = (ctx: any) => {
      if (keyExpr) {
        return evalInContext(keyExpr, ctx);
      }
      return ctx.$index;
    };

    const watchers = new WeakMap<object, Watcher>();

    const patcher = new KeyedListPatcher(
      (context) => {
        const frag = templateContent.cloneNode(true) as DocumentFragment;
        const subWatcher = new Watcher(context, this.attributeRegistry, this.componentRegistry);
        watchers.set(context, subWatcher);
        const nodes = Array.from(frag.childNodes);
        nodes.forEach((n) => subWatcher.onNode(n));
        return nodes;
      },
      getKey,
      (oldContext, newContext) => {
        for (const key of Reflect.ownKeys(newContext)) {
          if (typeof key === "symbol") {
            continue;
          }
          const desc = Object.getOwnPropertyDescriptor(newContext, key);
          if (!desc?.enumerable) {
            continue;
          }
          if (Object.is(oldContext[key], newContext[key])) {
            continue;
          }
          oldContext[key] = newContext[key];
          watchers.get(oldContext)?.update(key, newContext[key]);
        }
      },
    );

    const buildList = (source: any) => {
      const list: { context: any }[] = [];
      if (source == null) {
        return list;
      }

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
      } else if (typeof source?.[Symbol.iterator] === "function") {
        let index = 0;
        for (const val of source) {
          const ctx = Object.create(this.host);
          ctx.value = val;
          ctx.$index = index;
          if (varName) {
            ctx[varName] = val;
          }
          list.push({ context: ctx });
          index++;
        }
      } else if (source && typeof source.next === "function") {
        let index = 0;
        let result = source.next();
        while (!result.done) {
          const val = result.value;
          const ctx = Object.create(this.host);
          ctx.value = val;
          ctx.$index = index;
          if (varName) {
            ctx[varName] = val;
          }
          list.push({ context: ctx });
          index++;
          result = source.next();
        }
      }

      return list;
    };

    const render = (source?: any) => {
      const data = source !== undefined ? source : readHost(this.host, sourceExpr);
      if (!patcher.mounted) {
        const parent = commentEnd.parentNode;
        if (!parent) {
          return;
        }
        patcher.mount(parent, commentEnd);
      }
      patcher.patch(buildList(data));
    };

    // Fragment or live DOM: parent exists after replaceWith
    const parent = commentEnd.parentNode;
    if (parent) {
      patcher.mount(parent, commentEnd);
      render(readHost(this.host, sourceExpr));
    }

    for (const dep of collectDeps(sourceExpr)) {
      this.addWatchListener(dep, (value) => {
        // When dep is a root of a richer expression, re-read; when exact source, use value.
        if (dep === sourceExpr) {
          render(value);
        } else {
          render();
        }
      });
    }
  }

  private bindHtml(node: HTMLTemplateElement, expression: string) {
    const commentStart = document.createComment("html-start");
    const commentEnd = document.createComment("html-end");
    node.replaceWith(commentStart, commentEnd);

    const render = (htmlString: string) => {
      const parent = commentStart.parentNode;
      if (!parent) {
        return;
      }

      let current = commentStart.nextSibling;
      while (current && current !== commentEnd) {
        const next = current.nextSibling;
        parent.removeChild(current);
        current = next;
      }

      const template = document.createElement("template");
      template.innerHTML = htmlString ?? "";
      const fragment = template.content;
      Array.from(fragment.childNodes).forEach((child) => this.onNode(child));
      parent.insertBefore(fragment, commentEnd);
    };

    render(readHost(this.host, expression));
    for (const dep of collectDeps(expression)) {
      this.addWatchListener(dep, () => render(readHost(this.host, expression)));
    }
  }

  onText(node: Node) {
    const value = node.nodeValue!;
    const reg = /\{\{(.+?)\}\}/g;

    const textTokens: any[] = [];
    const tokenMap: Record<string, number[]> = {};
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let hasBinding = false;

    while ((match = reg.exec(value))) {
      hasBinding = true;
      const start = match.index;
      if (start > lastIndex) {
        textTokens.push(value.slice(lastIndex, start));
      }

      const key = match[1].trim();
      const val = getDeepValue(this.host, key);
      const pos = textTokens.length;
      textTokens.push(val ?? "");

      tokenMap[key] ??= [];
      tokenMap[key].push(pos);

      lastIndex = start + match[0].length;
    }

    if (!hasBinding) {
      return;
    }

    if (lastIndex < value.length) {
      textTokens.push(value.slice(lastIndex));
    }

    const flush = () => {
      node.nodeValue = textTokens.join("");
    };
    flush();

    for (const key in tokenMap) {
      const refresh = () => {
        const next = getDeepValue(this.host, key);
        for (const pos of tokenMap[key]) {
          textTokens[pos] = next ?? "";
        }
        flush();
      };

      for (const dep of collectDeps(key)) {
        this.addWatchListener(dep, (newVal) => {
          if (dep === key) {
            for (const pos of tokenMap[key]) {
              textTokens[pos] = newVal ?? "";
            }
            flush();
          } else {
            refresh();
          }
        });
      }
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

  update(key: string | symbol, newValue: any) {
    this.watchCallbacks.get(key)?.forEach((cb) => cb(newValue));

    // Notify path listeners like "item.label" when "item" changes
    if (typeof key === "string") {
      const prefix = key + ".";
      for (const [watchKey, callbacks] of this.watchCallbacks) {
        if (typeof watchKey === "string" && watchKey.startsWith(prefix)) {
          const nested = getDeepValue({ [key]: newValue }, watchKey);
          callbacks.forEach((cb) => cb(nested));
        }
      }
    }
  }
}
