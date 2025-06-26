import { builtinAttributeRegistry } from "./attributes/handlers/builtins.js";
import { AttributeRegistry } from "./attributes/registry.js";
import { ComponentRegistry } from "./components/registry.js";

import { Watcher } from "./watcher.js";

export function html(strings: TemplateStringsArray, ...values: any[]) {
  const template = document.createElement("template");
  const result = strings.reduce((acc, str, i) => acc + str + (values[i] ?? ""), "");
  template.innerHTML = result;
  return template;
}

export class Tive {
  static template: HTMLTemplateElement;
  static attributeRegistry: AttributeRegistry = builtinAttributeRegistry;
  static componentRegistry: ComponentRegistry = new ComponentRegistry();
  static properties: Record<string | symbol, any>;
  static components: Record<string, typeof Tive>;

  element: HTMLElement;
  name: string;
  #states: Record<string, any>;
  #watcher: Watcher;
  constructor() {
    const cons = this.constructor as typeof Tive;
    this.#states = {};
    this.#watcher = new Watcher(this, cons.attributeRegistry, cons.componentRegistry);

    for (const key in cons.properties) {
      Object.defineProperty(this, key, {
        get() {
          return this.#states[key];
        },
        set(newValue) {
          if (Object.is(newValue, this.#states[key])) {
            return;
          }
          this.#watcher.update(key, newValue);
          this.#states[key] = newValue;
        },
      });
    }
  }

  mount(element: HTMLElement) {
    this.element = element;
    const node = (this.constructor as typeof Tive).template.content.cloneNode(true);
    const children = Array.from(node.childNodes);
    children.forEach((child) => this.#watcher.onNode(child));
    this.element.appendChild(node);

    children.forEach((child) => {
      if (child instanceof Element) {
        this.#watcher.onNode(child);
      }
    });

    return this;
  }
}
