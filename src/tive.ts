import { builtinAttributeRegistry } from "./attributes/handlers/builtins.js";
import type { AttributeRegistry } from "./attributes/registry.js";
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

  element!: HTMLElement;
  name!: string;
  #states: Record<string, any>;
  #watcher: Watcher;
  constructor() {
    const cons = this.constructor as typeof Tive;
    this.#states = {};

    const componentRegistry =
      cons.components != null ? new ComponentRegistry(cons.components) : cons.componentRegistry;

    this.#watcher = new Watcher(this, cons.attributeRegistry, componentRegistry);

    for (const key in cons.properties) {
      Object.defineProperty(this, key, {
        get() {
          return this.#states[key];
        },
        set(newValue) {
          if (Object.is(newValue, this.#states[key])) {
            return;
          }
          this.#states[key] = newValue;
          this.#watcher.update(key, newValue);
        },
      });
    }
  }

  mount(element: HTMLElement) {
    this.element = element;
    const node = (this.constructor as typeof Tive).template.content.cloneNode(true);
    Array.from(node.childNodes).forEach((child) => this.#watcher.onNode(child));
    this.element.appendChild(node);
    return this;
  }
}
