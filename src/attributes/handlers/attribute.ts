import type { Context, Evaluated } from "../registry";

export class AttributeHandler {
  static test(name: string, context: Context) {
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
    this.element.setAttribute(this.attr.name, newValue);
  }
}
