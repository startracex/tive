import { DependencyBus, getBus, setBus } from "./effect.js";

const reactiveMap = new WeakMap<object, any>();
const RAW = Symbol("raw");

export function toRaw<T>(value: T): T {
  if (value && typeof value === "object" && (value as any)[RAW]) {
    return (value as any)[RAW];
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, any> {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === Array.prototype || proto === null;
}

function notifyPath(bus: DependencyBus, path: string) {
  bus.notify(path);
  const parts = path.split(".");
  while (parts.length > 1) {
    parts.pop();
    bus.notify(parts.join("."));
  }
}

function deepProxy<T extends object>(target: T, bus: DependencyBus, path: string): T {
  const cached = reactiveMap.get(target);
  if (cached) {
    return cached;
  }

  const proxy = new Proxy(target, {
    get(obj, key, receiver) {
      if (key === RAW) {
        return obj;
      }
      const value = Reflect.get(obj, key, receiver);
      if (typeof key === "symbol") {
        return value;
      }
      if (value && typeof value === "object" && isPlainObject(value)) {
        return deepProxy(value, bus, path ? `${path}.${String(key)}` : String(key));
      }
      return value;
    },
    set(obj, key, value, receiver) {
      if (typeof key === "symbol") {
        return Reflect.set(obj, key, value, receiver);
      }
      const old = Reflect.get(obj, key, receiver);
      const rawValue = toRaw(value);
      if (Object.is(old, rawValue)) {
        return true;
      }
      const ok = Reflect.set(obj, key, rawValue, receiver);
      const full = path ? `${path}.${String(key)}` : String(key);
      notifyPath(bus, full);
      if (path) {
        notifyPath(bus, path);
      }
      return ok;
    },
    deleteProperty(obj, key) {
      if (typeof key === "symbol") {
        return Reflect.deleteProperty(obj, key);
      }
      const ok = Reflect.deleteProperty(obj, key);
      const full = path ? `${path}.${String(key)}` : String(key);
      notifyPath(bus, full);
      if (path) {
        notifyPath(bus, path);
      }
      return ok;
    },
  });

  reactiveMap.set(target, proxy);
  return proxy;
}

/** Make declared properties on `host` reactive via an attached DependencyBus. */
export function bindReactiveProperties(
  host: object,
  propertyKeys: (string | symbol)[],
  bus?: DependencyBus,
) {
  const dependencyBus = bus ?? getBus(host);
  setBus(host, dependencyBus);

  const state: Record<string | symbol, any> = {};

  for (const key of propertyKeys) {
    Object.defineProperty(host, key, {
      configurable: true,
      enumerable: true,
      get() {
        const value = state[key];
        if (value && typeof value === "object" && isPlainObject(value)) {
          return deepProxy(value, dependencyBus, String(key));
        }
        return value;
      },
      set(newValue) {
        const raw = toRaw(newValue);
        if (Object.is(state[key], raw)) {
          return;
        }
        state[key] = raw;
        dependencyBus.notify(String(key));
      },
    });
  }

  return dependencyBus;
}

/** Scope for list-item / local bindings, prototypally linked to parent host. */
export function createChildScope(parent: object, locals: Record<string, any>) {
  const bus = new DependencyBus();
  const state: Record<string, any> = { ...locals };
  const proto = parent;

  const scope = new Proxy(Object.create(proto), {
    get(_t, key, receiver) {
      if (key === RAW) {
        return state;
      }
      if (typeof key === "symbol") {
        return Reflect.get(proto, key, receiver);
      }
      if (Object.prototype.hasOwnProperty.call(state, key)) {
        const value = state[key];
        if (value && typeof value === "object" && isPlainObject(value)) {
          return deepProxy(value, bus, String(key));
        }
        return value;
      }
      return Reflect.get(proto, key, receiver);
    },
    set(_t, key, value) {
      if (typeof key === "symbol") {
        return Reflect.set(proto, key, value);
      }
      if (Object.prototype.hasOwnProperty.call(state, key) || !(key in proto)) {
        const raw = toRaw(value);
        if (Object.is(state[key], raw)) {
          return true;
        }
        state[key] = raw;
        bus.notify(String(key));
        return true;
      }
      (proto as any)[key] = value;
      return true;
    },
    has(_t, key) {
      return key in state || key in proto;
    },
    ownKeys() {
      return Reflect.ownKeys(state);
    },
    getOwnPropertyDescriptor(_t, key) {
      if (Object.prototype.hasOwnProperty.call(state, key)) {
        return {
          configurable: true,
          enumerable: true,
          writable: true,
          value: state[key as string],
        };
      }
      return Reflect.getOwnPropertyDescriptor(proto, key);
    },
  });

  setBus(scope, bus);

  function assign(next: Record<string, any>) {
    for (const key of Object.keys(next)) {
      const raw = toRaw(next[key]);
      if (Object.is(state[key], raw)) {
        continue;
      }
      state[key] = raw;
      bus.notify(key);
    }
  }

  return { scope, bus, assign };
}
