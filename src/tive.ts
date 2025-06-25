import { Watcher } from "./watcher.js";
export class Tive {
  static template: HTMLTemplateElement;
  static properties: Record<string | symbol, any>;
  element: HTMLElement;
  name: string;
  #states: Record<string, any>;
  #watcher: Watcher;

  constructor() {
    this.#states = {};
    this.#watcher = new Watcher(this);

    for (const key in (this.constructor as typeof Tive).properties) {
      Object.defineProperty(this, key, {
        get() {
          return this.#states[key];
        },
        set(newValue) {
          this.#watcher.update(key, newValue);
          return (this.#states[key] = newValue);
        },
      });
    }
  }

  mount(element: HTMLElement) {
    this.element = element;
    const node = (this.constructor as typeof Tive).template.content.cloneNode(true);

    node.childNodes.forEach((node) => this.#watcher.onNode(node));

    this.element.appendChild(node);

    return this;
  }
}
