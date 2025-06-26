import { AttributeHandler } from "./handlers/attribute.js";

export type EvalFunction = (code: string, context: Context) => Evaluated;
export interface Evaluated {
  raw: string;
  value: any;
  deps: string[];
}
export type WatchFunction = (dep: string, cb: (val: any) => void) => void;

export interface Context {
  host: any;
  resolved: Set<string>;
  allAttributes: Attr[];
  index: number;
  evaluate: EvalFunction;
  watch: (result: Evaluated, cb: (newValue: any) => void) => void;
}

export function createContext({
  host,
  evaluator,
  watchFn,
  allAttributes,
  index,
  resolved,
}: {
  host: any;
  evaluator: EvalFunction;
  watchFn: WatchFunction;
  allAttributes: Attr[];
  index: number;
  resolved?: Set<string>;
}): Context {
  return {
    host,
    index,
    allAttributes,
    resolved: resolved ?? new Set(),

    evaluate: evaluator,

    watch(evaluated, callback) {
      for (const dep of evaluated.deps) {
        watchFn(dep, callback);
      }
    },
  };
}

export const evaluateExpression = (raw: string, thisArg) => {
  const match = raw.match(/\{\{(.+?)\}\}/);
  if (!match) return { raw, value: raw.trim(), deps: [] };

  const expr = match[1].trim();
  const fn = new Function("with(this){return " + expr + "}");
  return {
    raw,
    value: fn.call(thisArg),
    deps: [expr],
  };
};

export class AttributeRegistry {
  handlers: (typeof AttributeHandler)[] = [];

  register(...h: (typeof AttributeHandler)[]): this {
    this.handlers.push(...h);
    return this;
  }

  apply(el: Element, attr: Attr, ctx: Context): void {
    const expr = ctx.evaluate(attr.value, ctx.host);
    for (const handler of this.handlers) {
      if (handler.test(attr.name, ctx)) {
        const h = new handler(el, attr, expr, ctx);
        h.init();
        ctx.watch?.(expr, (val) => {
          h.update(val);
        });
        break;
      }
    }

    if (ctx.resolved.size === ctx.allAttributes.length) {
      return;
    }

    console.warn(`no handler matched ${attr.name}`);
  }
}
