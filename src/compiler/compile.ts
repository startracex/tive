import { applyRest, setAttr, setBoolAttr, setProp } from "../runtime/bindings.js";
import { Block } from "../runtime/block.js";
import { KeyedListPatcher } from "../runtime/list.js";
import { createChildScope } from "../runtime/reactive.js";
import type {
  Binding,
  ComponentNode,
  ElementNode,
  ForNode,
  HtmlNode,
  IfNode,
  IRNode,
  RootNode,
  TextNode,
} from "./ir.js";
import { parseTemplate } from "./parse.js";

export type MountFn = (host: any, parent: Node, anchor?: Node | null, parentBlock?: Block) => Block;

export interface CompiledView {
  mount: MountFn;
}

function resolveComponent(host: any, tag: string): (new () => any) | undefined {
  const cons = host?.constructor;
  if (cons?.components?.[tag]) {
    return cons.components[tag];
  }
  return cons?.componentRegistry?.get?.(tag);
}

function compileBindings(el: Element, bindings: Binding[], block: Block, host: any) {
  const skip = new Set(bindings.map((b) => b.name));
  let restPrev: Record<string, any> = {};

  for (const binding of bindings) {
    if (binding.kind === "event") {
      block.effect(binding.expr.deps, () => {
        const value = binding.expr.get(host);
        const listener =
          typeof value === "function" ? (value.bind ? value.bind(host) : value) : null;
        if (!listener) {
          return;
        }
        el.addEventListener(binding.name, listener);
        return () => el.removeEventListener(binding.name, listener);
      });
      continue;
    }

    if (binding.kind === "rest") {
      block.effect(binding.expr.deps, () => {
        restPrev = applyRest(el, binding.expr.get(host), restPrev, skip);
      });
      continue;
    }

    block.effect(binding.expr.deps, () => {
      const value = binding.expr.get(host);
      if (binding.kind === "bool") {
        setBoolAttr(el, binding.name, value);
      } else if (binding.kind === "prop") {
        setProp(el, binding.name, value);
      } else {
        setAttr(el, binding.name, value);
      }
    });
  }
}

function compileText(node: TextNode): MountFn {
  return (host, parent, anchor, parentBlock) => {
    const block = new Block(host);
    const hasDynamic = node.segments.some((s) => s.type === "dynamic");

    if (!hasDynamic) {
      const text = document.createTextNode(node.segments.map((s) => s.value ?? "").join(""));
      block.nodes.push(text);
      parent.insertBefore(text, anchor ?? null);
      parentBlock?.addChild(block);
      return block;
    }

    const parts: (string | { expr: (typeof node.segments)[0]["expr"] })[] = [];
    const deps = new Set<string>();
    for (const seg of node.segments) {
      if (seg.type === "static") {
        parts.push(seg.value ?? "");
      } else {
        parts.push({ expr: seg.expr });
        seg.expr!.deps.forEach((d) => deps.add(d));
      }
    }

    const text = document.createTextNode("");
    block.nodes.push(text);
    parent.insertBefore(text, anchor ?? null);

    block.effect([...deps], () => {
      text.nodeValue = parts
        .map((p) => (typeof p === "string" ? p : String(p.expr!.get(host) ?? "")))
        .join("");
    });

    parentBlock?.addChild(block);
    return block;
  };
}

function compileElement(node: ElementNode): MountFn {
  const childMounts = node.children.map(compileNode);

  return (host, parent, anchor, parentBlock) => {
    const block = new Block(host);
    const el = document.createElement(node.tag);
    block.nodes.push(el);
    parent.insertBefore(el, anchor ?? null);

    compileBindings(el, node.bindings, block, host);

    for (const childMount of childMounts) {
      childMount(host, el, null, block);
    }

    parentBlock?.addChild(block);
    return block;
  };
}

function compileIf(node: IfNode): MountFn {
  const childMounts = node.children.map(compileNode);

  return (host, parent, anchor, parentBlock) => {
    const block = new Block(host);
    const start = document.createComment("if-start");
    const end = document.createComment("if-end");
    block.nodes.push(start, end);
    parent.insertBefore(start, anchor ?? null);
    parent.insertBefore(end, anchor ?? null);

    let childRoot: Block | null = null;

    block.effect(node.condition.deps, () => {
      const show = !!node.condition.get(host);
      if (show && !childRoot) {
        childRoot = new Block(host);
        block.addChild(childRoot);
        for (const childMount of childMounts) {
          childMount(host, end.parentNode!, end, childRoot);
        }
      } else if (!show && childRoot) {
        block.removeChild(childRoot);
        childRoot.unmount();
        childRoot = null;
      }
    });

    block.onCleanup(() => {
      childRoot?.unmount();
      childRoot = null;
    });

    parentBlock?.addChild(block);
    return block;
  };
}

function compileFor(node: ForNode): MountFn {
  const itemView = compileRoot({ type: "root", children: node.children });

  return (host, parent, anchor, parentBlock) => {
    const block = new Block(host);
    const start = document.createComment("for-start");
    const end = document.createComment("for-end");
    block.nodes.push(start, end);
    parent.insertBefore(start, anchor ?? null);
    parent.insertBefore(end, anchor ?? null);

    const patcher = new KeyedListPatcher(
      (locals) => {
        const { scope, assign } = createChildScope(host, locals);
        // Do not parent into for-block children list; patcher owns item lifetimes
        const itemBlock = itemView.mount(scope, end.parentNode!, end);
        return { nodes: itemBlock.nodes.slice(), context: scope, block: itemBlock, assign };
      },
      (ctx) => {
        if (node.key) {
          return node.key.get(ctx);
        }
        return ctx.$index;
      },
      (entry, newLocals) => {
        entry.assign?.(newLocals);
      },
    );

    patcher.mount(end.parentNode!, end);

    const buildLocals = (source: any): Record<string, any>[] => {
      const list: Record<string, any>[] = [];
      if (source === null || source === undefined) {
        return list;
      }

      if (node.mode === "of" && Array.isArray(source)) {
        source.forEach((item, index) => {
          list.push({ [node.varName]: item, $index: index });
        });
      } else if (node.mode === "in" && typeof source === "object") {
        Object.keys(source).forEach((key, index) => {
          list.push({ [node.varName]: key, $value: source[key], $index: index });
        });
      } else if (typeof source?.[Symbol.iterator] === "function") {
        let index = 0;
        for (const value of source) {
          list.push({ [node.varName]: value, value, $index: index });
          index++;
        }
      }
      return list;
    };

    block.effect(node.source.deps, () => {
      const source = node.source.get(host);
      patcher.patch(buildLocals(source));
    });

    block.onCleanup(() => patcher.clear());

    parentBlock?.addChild(block);
    return block;
  };
}

function compileHtml(node: HtmlNode): MountFn {
  return (host, parent, anchor, parentBlock) => {
    const block = new Block(host);
    const start = document.createComment("html-start");
    const end = document.createComment("html-end");
    block.nodes.push(start, end);
    parent.insertBefore(start, anchor ?? null);
    parent.insertBefore(end, anchor ?? null);

    let inner: ChildNode[] = [];

    block.effect(node.expr.deps, () => {
      for (const n of inner) {
        n.parentNode?.removeChild(n);
      }
      inner = [];
      const html = node.expr.get(host) ?? "";
      const tpl = document.createElement("template");
      tpl.innerHTML = String(html);
      const nodes = Array.from(tpl.content.childNodes) as ChildNode[];
      for (const n of nodes) {
        end.parentNode!.insertBefore(n, end);
        inner.push(n);
      }
    });

    parentBlock?.addChild(block);
    return block;
  };
}

function compileComponent(node: ComponentNode): MountFn {
  const slotViews: Record<string, CompiledView> = {};
  for (const [name, children] of Object.entries(node.slots)) {
    slotViews[name] = compileRoot({ type: "root", children });
  }

  return (host, parent, anchor, parentBlock) => {
    const block = new Block(host);
    const Ctor = resolveComponent(host, node.tag);

    if (!Ctor) {
      // fallback: unknown custom element as plain element
      const el = document.createElement(node.tag);
      block.nodes.push(el);
      parent.insertBefore(el, anchor ?? null);
      parentBlock?.addChild(block);
      return block;
    }

    const instance = new Ctor();
    const mountEl = document.createElement(node.tag);
    block.nodes.push(mountEl);
    parent.insertBefore(mountEl, anchor ?? null);

    for (const prop of node.props) {
      block.effect(prop.expr.deps, () => {
        (instance as any)[prop.name] = prop.expr.get(host);
      });
    }

    instance.mount(mountEl);

    // inject slots into mounted output
    mountEl.querySelectorAll("slot").forEach((slotEl: Element) => {
      const name = slotEl.getAttribute("name") ?? "";
      const view = slotViews[name];
      if (!view) {
        slotEl.remove();
        return;
      }
      const slotBlock = new Block(host);
      const fragParent = slotEl.parentNode!;
      const slotAnchor = slotEl.nextSibling;
      slotEl.remove();
      view.mount(host, fragParent, slotAnchor, slotBlock);
      block.addChild(slotBlock);
    });

    block.onCleanup(() => {
      instance.unmount?.();
    });

    parentBlock?.addChild(block);
    return block;
  };
}

function compileNode(node: IRNode): MountFn {
  switch (node.type) {
    case "root":
      return compileRoot(node).mount;
    case "text":
      return compileText(node);
    case "element":
      return compileElement(node);
    case "if":
      return compileIf(node);
    case "for":
      return compileFor(node);
    case "html":
      return compileHtml(node);
    case "component":
      return compileComponent(node);
    default:
      return () => new Block();
  }
}

export function compileRoot(root: RootNode): CompiledView {
  const childMounts = root.children.map(compileNode);

  return {
    mount(host, parent, anchor = null, parentBlock) {
      const block = new Block(host);
      for (const childMount of childMounts) {
        const child = childMount(host, parent, anchor, block);
        // hoist child root nodes onto this block for list reuse tracking
        for (const n of child.nodes) {
          if (!block.nodes.includes(n)) {
            block.nodes.push(n);
          }
        }
      }
      parentBlock?.addChild(block);
      return block;
    },
  };
}

export function compileHtmlString(html: string): CompiledView {
  return compileRoot(parseTemplate(html));
}

const cache = new WeakMap<TemplateStringsArray, CompiledView>();

export function compileTagged(strings: TemplateStringsArray, values: any[]): CompiledView {
  const cached = cache.get(strings);
  if (cached && values.every((v) => v === null || v === undefined || v === "")) {
    return cached;
  }

  const html = strings.reduce((acc, str, i) => acc + str + (values[i] ?? ""), "");
  const view = compileHtmlString(html);
  if (values.every((v) => v === null || v === undefined || v === "")) {
    cache.set(strings, view);
  }
  return view;
}
