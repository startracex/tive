import type { Context, Evaluated } from "../registry.js";

export class AttributeHandler {
  static test(_name: string, _context: Context) {
    return true;
  }

  element: Element;
  attr: Attr;
  evaluated: Evaluated;
  context: Context;
  constructor(element: Element, attr: Attr, evaluated: Evaluated, context: Context) {
    this.element = element;
    this.attr = attr;
    this.evaluated = evaluated;
    this.context = context;
  }

  init() {
    this.context.resolved.add(this.attr.name);
    this.update(this.evaluated.value);
  }

  update(newValue: any) {
    if (newValue == null || newValue === false) {
      this.element.removeAttribute(this.attr.name);
      return;
    }
    this.element.setAttribute(this.attr.name, String(newValue));
  }
}
