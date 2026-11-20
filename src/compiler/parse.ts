import type { Binding, IRNode, RootNode } from "./ir.js";
import { compileExpr, compileMustacheText, compileMustacheValue } from "./expr.js";

function parseBinding(attrName: string, attrValue: string): Binding | null {
  if (attrName === "...") {
    const expr = compileMustacheValue(attrValue) ?? compileExpr(attrValue);
    return { kind: "rest", name: "...", expr };
  }
  if (attrName.startsWith("@")) {
    const expr = compileMustacheValue(attrValue);
    if (!expr) {
      return null;
    }
    return { kind: "event", name: attrName.slice(1), expr };
  }
  if (attrName.startsWith("?")) {
    const expr = compileMustacheValue(attrValue);
    if (!expr) {
      return null;
    }
    return { kind: "bool", name: attrName.slice(1), expr };
  }
  if (attrName.startsWith(".") && attrName !== "...") {
    const expr = compileMustacheValue(attrValue);
    if (!expr) {
      return null;
    }
    return { kind: "prop", name: attrName.slice(1), expr };
  }

  const expr = compileMustacheValue(attrValue);
  if (expr) {
    return { kind: "attr", name: attrName, expr };
  }

  // static attribute
  return {
    kind: "attr",
    name: attrName,
    expr: {
      source: JSON.stringify(attrValue),
      deps: [],
      get: () => attrValue,
    },
  };
}

function parseForAttr(value: string): {
  mode: "of" | "in" | "source";
  varName: string;
  source: string;
} {
  const match = value.match(/\{\{(.+?)\}\}/);
  const raw = (match ? match[1] : value).trim();

  if (raw.includes(" of ")) {
    const [varName, source] = raw.split(" of ").map((s) => s.trim());
    return { mode: "of", varName, source };
  }
  if (raw.includes(" in ")) {
    const [varName, source] = raw.split(" in ").map((s) => s.trim());
    return { mode: "in", varName, source };
  }
  return { mode: "source", varName: "value", source: raw };
}

function isComponentTag(tag: string) {
  return tag.includes("-");
}

function walkNodes(nodes: NodeListOf<ChildNode> | ChildNode[]): IRNode[] {
  const out: IRNode[] = [];
  for (const node of Array.from(nodes)) {
    const ir = walkNode(node);
    if (ir) {
      out.push(ir);
    }
  }
  return out;
}

function walkNode(node: Node): IRNode | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.nodeValue ?? "";
    if (!text) {
      return null;
    }
    const { segments } = compileMustacheText(text);
    // drop empty text nodes; keep whitespace-only for layout fidelity
    if (segments.length === 1 && segments[0].type === "static" && !segments[0].value) {
      return null;
    }
    return { type: "text", segments };
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }
  const el = node as Element;
  const tag = el.tagName.toLowerCase();

  if (tag === "template") {
    const ifAttr = el.getAttribute("if");
    if (ifAttr) {
      const condition = compileMustacheValue(ifAttr) ?? compileExpr(ifAttr);
      return {
        type: "if",
        condition,
        children: walkNodes((el as HTMLTemplateElement).content.childNodes),
      };
    }

    const forAttr = el.getAttribute("for");
    if (forAttr) {
      const parsed = parseForAttr(forAttr);
      const keyRaw = el.getAttribute("key");
      const key = keyRaw
        ? (compileMustacheValue(keyRaw) ?? compileExpr(keyRaw.replace(/\{\{|\}\}/g, "")))
        : undefined;
      return {
        type: "for",
        mode: parsed.mode,
        varName: parsed.varName,
        source: compileExpr(parsed.source),
        key,
        children: walkNodes((el as HTMLTemplateElement).content.childNodes),
      };
    }

    const htmlAttr = el.getAttribute("html");
    if (htmlAttr) {
      const expr = compileMustacheValue(htmlAttr) ?? compileExpr(htmlAttr);
      return { type: "html", expr };
    }

    return null;
  }

  if (isComponentTag(tag)) {
    const props: Binding[] = [];
    for (const attr of Array.from(el.attributes)) {
      if (attr.name === "slot") {
        continue;
      }
      const binding = parseBinding(attr.name, attr.value);
      if (binding) {
        props.push(binding);
      }
    }

    const slots: Record<string, IRNode[]> = {};
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const childEl = child as Element;
        const slotName = childEl.getAttribute("slot") ?? "";
        const ir = walkNode(child);
        if (!ir) {
          continue;
        }
        slots[slotName] ??= [];
        slots[slotName].push(ir);
      } else if (child.nodeType === Node.TEXT_NODE && child.nodeValue?.trim()) {
        const ir = walkNode(child);
        if (!ir) {
          continue;
        }
        slots[""] ??= [];
        slots[""].push(ir);
      }
    }

    return { type: "component", tag, props, slots };
  }

  const bindings: Binding[] = [];
  for (const attr of Array.from(el.attributes)) {
    const binding = parseBinding(attr.name, attr.value);
    if (binding) {
      bindings.push(binding);
    }
  }

  return {
    type: "element",
    tag,
    bindings,
    children: walkNodes(el.childNodes),
  };
}

export function parseTemplate(html: string): RootNode {
  const template = document.createElement("template");
  template.innerHTML = html;
  return {
    type: "root",
    children: walkNodes(template.content.childNodes),
  };
}
