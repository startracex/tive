import { AttributeHandler } from "./attribute.js";

export class EventHandler extends AttributeHandler {
  static test(name: string) {
    return name.startsWith("@");
  }

  private readonly prop = this.attr.name.slice(1);

  private listener: EventListener | null = null;

  init() {
    this.context.resolved.add(this.attr.name);
    this.bind(this.evaluated.value);
    this.element.removeAttribute(this.attr.name);
  }

  update(val: any): void {
    this.bind(val);
  }

  destroy() {
    if (this.listener) {
      this.element.removeEventListener(this.prop, this.listener);
      this.listener = null;
    }
  }

  private bind(val: any) {
    if (this.listener) {
      this.element.removeEventListener(this.prop, this.listener);
      this.listener = null;
    }
    if (typeof val !== "function") {
      return;
    }
    this.listener = val.bind?.(this.context.host) ?? val;
    this.element.addEventListener(this.prop, this.listener);
  }
}
