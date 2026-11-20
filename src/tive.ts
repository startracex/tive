import { compileTagged, type CompiledView } from "./compiler/compile.js";
import { ComponentRegistry } from "./components/registry.js";
import { Block } from "./runtime/block.js";
import { DependencyBus, setBus } from "./runtime/effect.js";
import { bindReactiveProperties } from "./runtime/reactive.js";

export type { CompiledView };

const emptyView: CompiledView = {
  mount(host) {
    return new Block(host);
  },
};

export function html(strings: TemplateStringsArray, ...values: any[]): CompiledView {
  return compileTagged(strings, values);
}

export class Tive {
  static template: CompiledView = emptyView;
  static properties: Record<string | symbol, any> = {};
  static components: Record<string, typeof Tive> = {};
  static componentRegistry: ComponentRegistry = new ComponentRegistry();

  element!: HTMLElement;
  #root: Block | null = null;
  #bus: DependencyBus;

  constructor() {
    const cons = this.constructor as typeof Tive;
    this.#bus = new DependencyBus();
    setBus(this, this.#bus);
    this.#ensureReactive(cons);
  }

  /** Re-install accessors so subclass field init cannot wipe them permanently. */
  #ensureReactive(cons: typeof Tive = this.constructor as typeof Tive) {
    const keys = cons.properties ? Reflect.ownKeys(cons.properties) : [];
    if (!keys.length) {
      return;
    }

    const snapshot: Record<string | symbol, any> = {};
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(this, key) || key in this) {
        snapshot[key] = (this as any)[key];
      }
    }

    bindReactiveProperties(this, keys, this.#bus);

    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(snapshot, key)) {
        (this as any)[key] = snapshot[key];
      }
    }
  }

  mount(element: HTMLElement) {
    // Subclass `count: number` fields run after super() and replace accessors;
    // re-bind here so later assignments still notify.
    this.#ensureReactive();
    this.element = element;
    const view = (this.constructor as typeof Tive).template ?? emptyView;
    this.#root = view.mount(this, element, null);
    return this;
  }

  unmount() {
    this.#root?.unmount();
    this.#root = null;
    this.#bus.clear();
    return this;
  }
}
