import { AttributeHandler } from "./attribute";

export class BooleanAttrHandler extends AttributeHandler {
  static test(name: string) {
    return name.startsWith("?");
  }

  private readonly prop = this.attr.name.slice(1);

  init() {
    super.init();
    this.element.removeAttribute(this.attr.name);
  }

  update(newValue: any) {
    if (newValue) {
      this.element.setAttribute(this.prop, "");
    } else {
      this.element.removeAttribute(this.prop);
    }
  }

  private apply(value: any) {
    if (value) {
      this.element.setAttribute(this.prop, "");
    } else {
      this.element.removeAttribute(this.prop);
    }
  }
}
