import { Effect, getBus, type EffectFn } from "./effect.js";

export class Block {
  nodes: ChildNode[] = [];
  children: Block[] = [];
  #effects: Effect[] = [];
  #cleanups: (() => void)[] = [];
  #host: object | null = null;
  alive = true;

  constructor(host?: object) {
    if (host) {
      this.#host = host;
    }
  }

  get host() {
    return this.#host;
  }

  setHost(host: object) {
    this.#host = host;
  }

  /** Register and run an effect subscribed to compile-time deps on the host bus. */
  effect(deps: string[], fn: EffectFn) {
    if (!this.#host) {
      throw new Error("Block host is not set");
    }
    const effect = new Effect(deps, fn);
    this.#effects.push(effect);
    const bus = getBus(this.#host);
    bus.subscribe(effect);
    effect.run();
    return effect;
  }

  onCleanup(fn: () => void) {
    this.#cleanups.push(fn);
  }

  addChild(child: Block) {
    this.children.push(child);
  }

  removeChild(child: Block) {
    const i = this.children.indexOf(child);
    if (i >= 0) {
      this.children.splice(i, 1);
    }
  }

  /** Append this block's root nodes into a parent before an optional anchor. */
  insert(parent: Node, anchor: Node | null = null) {
    for (const node of this.nodes) {
      parent.insertBefore(node, anchor);
    }
  }

  unmount() {
    if (!this.alive) {
      return;
    }
    this.alive = false;

    for (const child of [...this.children]) {
      child.unmount();
    }
    this.children.length = 0;

    for (const effect of this.#effects) {
      if (this.#host) {
        getBus(this.#host).unsubscribe(effect);
      }
      effect.stop();
    }
    this.#effects.length = 0;

    for (const cleanup of this.#cleanups) {
      try {
        cleanup();
      } catch {
        /* ignore */
      }
    }
    this.#cleanups.length = 0;

    for (const node of this.nodes) {
      node.parentNode?.removeChild(node);
    }
    this.nodes.length = 0;
  }
}
