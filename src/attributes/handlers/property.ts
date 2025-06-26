import { AttributeHandler } from "./attribute";

export class PropertyHandler extends AttributeHandler {
  static test(name: string) {
    return name.startsWith(".") && name !== "...";
  }

  private readonly prop = this.attr.name.slice(1);

  init() {
    super.init();
    this.element.removeAttribute(this.attr.name);
  }

  update(newValue: any) {
    this.element[this.prop] = newValue;
  }
}
