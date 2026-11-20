export type EffectFn = () => void | (() => void);

export class Effect {
  deps: string[];
  fn: EffectFn;
  cleanup: (() => void) | null = null;
  active = true;

  constructor(deps: string[], fn: EffectFn) {
    this.deps = deps;
    this.fn = fn;
  }

  run() {
    if (!this.active) {
      return;
    }
    this.cleanup?.();
    this.cleanup = null;
    const result = this.fn();
    if (typeof result === "function") {
      this.cleanup = result;
    }
  }

  stop() {
    this.active = false;
    this.cleanup?.();
    this.cleanup = null;
  }
}

export class DependencyBus {
  #subs = new Map<string, Set<Effect>>();

  subscribe(effect: Effect) {
    for (const dep of effect.deps) {
      let set = this.#subs.get(dep);
      if (!set) {
        set = new Set();
        this.#subs.set(dep, set);
      }
      set.add(effect);
    }
  }

  unsubscribe(effect: Effect) {
    for (const dep of effect.deps) {
      this.#subs.get(dep)?.delete(effect);
    }
  }

  notify(key: string) {
    const ran = new Set<Effect>();
    const fire = (k: string) => {
      const set = this.#subs.get(k);
      if (!set) {
        return;
      }
      for (const effect of [...set]) {
        if (ran.has(effect) || !effect.active) {
          continue;
        }
        ran.add(effect);
        effect.run();
      }
    };

    fire(key);

    // parent path: item.label -> also listeners on "item" already fired separately by caller;
    // child paths: item -> item.label, item.id, ...
    const prefix = key + ".";
    for (const dep of this.#subs.keys()) {
      if (dep.startsWith(prefix)) {
        fire(dep);
      }
    }
  }

  clear() {
    this.#subs.clear();
  }
}

const buses = new WeakMap<object, DependencyBus>();

export function getBus(host: object): DependencyBus {
  let bus = buses.get(host);
  if (!bus) {
    bus = new DependencyBus();
    buses.set(host, bus);
  }
  return bus;
}

export function setBus(host: object, bus: DependencyBus) {
  buses.set(host, bus);
}
