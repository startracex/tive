import { AttributeHandler } from "./attribute.js";

export class RestHandler extends AttributeHandler {
  static test(name: string) {
    return name === "...";
  }

  private prev: Record<string, any> = {};

  init() {
    this.context.resolved.add(this.attr.name);
    this.apply(this.evaluated.value);
    this.element.removeAttribute(this.attr.name);
  }

  update(newValue: any) {
    this.apply(newValue);
    this.prev = typeof newValue === "object" && newValue != null ? { ...newValue } : {};
  }

  private apply(value: Record<string, any>) {
    if (typeof value !== "object" || value === null) {
      return;
    }

    const keys = new Set([...Object.keys(this.prev), ...Object.keys(value)]);

    for (const key of keys) {
      if (this.context.resolved.has(key)) {
        continue;
      }
      if (this.prev[key] !== value[key]) {
        (this.element as any)[key] = value[key];
      }
    }
  }
}
