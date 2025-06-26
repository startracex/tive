import { evaluateExpression } from "../attributes/registry.js";
import type { Tive } from "../tive.js";

type SlotMap = Record<string, Node[]>;

export class ComponentRegistry {
  private components = new Map<string, typeof Tive>();

  constructor(components: Record<string, typeof Tive> = {}) {
    for (const [tag, ctor] of Object.entries(components)) {
      this.define(tag, ctor);
    }
  }

  define(tag: string, ctor: typeof Tive) {
    this.components.set(tag.toLowerCase(), ctor);
  }

  createIfComponent(el: Element, parentHost: any): boolean {
    const tag = el.tagName.toLowerCase();
    const Ctor = this.components.get(tag);
    if (!Ctor) return false;

    const props = extractProps(el, parentHost);
    const slots = extractSlots(el);

    const instance = new Ctor();

    Object.assign(instance, props);

    const mountEl = document.createElement("div");
    el.replaceWith(mountEl);

    instance.mount(mountEl);

    injectSlots(mountEl, slots);

    return true;
  }
}
function extractSlots(el: Element): SlotMap {
  const slots: SlotMap = {};

  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const elem = child as Element;
      const name = elem.getAttribute("slot") ?? "";
      slots[name] ??= [];
      slots[name].push(elem.cloneNode(true));
    } else {
      slots[""] ??= [];
      slots[""].push(child.cloneNode(true));
    }
  }

  return slots;
}
function injectSlots(el: Element, slots: SlotMap) {
  el.querySelectorAll("slot").forEach((slot) => {
    const name = slot.getAttribute("name") ?? "";
    const content = slots[name];

    if (content?.length) {
      slot.replaceWith(...content);
    } else {
      slot.remove();
    }
  });
}
function extractProps(el: Element, host: any): Record<string, any> {
  const props: Record<string, any> = {};

  for (const attr of Array.from(el.attributes)) {
    if (attr.name === "slot") continue;
    props[attr.name] = evaluateExpression(attr.value, host).value;
  }

  return props;
}
