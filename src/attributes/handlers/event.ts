import { AttributeHandler } from "./attribute";

export class EventHandler extends AttributeHandler {
  static test(name: string) {
    return name.startsWith("@");
  }

  private readonly prop = this.attr.name.slice(1);

  private listener: EventListener;

  init() {
    this.context.resolved.add(this.attr.name);
    if (typeof this.evaluated.value === "function") {
      this.listener = this.evaluated.value.bind?.(this.context.host) ?? this.evaluated.value;
    }
    this.element.addEventListener(this.prop, this.listener);
    this.element.removeAttribute(this.attr.name);
  }

  update(val: any): void {}

  destroy() {
    this.element.removeEventListener(this.prop, this.listener);
  }
}
