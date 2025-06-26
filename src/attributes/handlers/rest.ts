import { AttributeHandler } from "./attribute";

export class RestHandler extends AttributeHandler {
  static test(name: string) {
    return name === "...";
  }

  private prev: Record<string, any> = {};

  init() {
    super.init();
    this.apply(this.evaluated.value);
    this.element.removeAttribute(this.attr.name);
  }

  update(newValue: any) {
    this.apply(newValue);
    this.prev = { ...newValue };
  }

  private apply(value: Record<string, any>) {
    if (typeof value !== "object" || value === null) return;

    const keys = new Set([...Object.keys(this.prev), ...Object.keys(value)]);

    for (const key of keys) {
      if (this.context.resolved.has(key)) continue;
      if (this.prev[key] !== value[key]) {
        this.element[key] = value[key];
      }
    }
  }
}
