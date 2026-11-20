import type { AttributeHandler } from "./handlers/attribute.js";

export type EvalFunction = (code: string, context: any) => Evaluated;
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

const KEYWORDS = new Set([
  "true",
  "false",
  "null",
  "undefined",
  "NaN",
  "Infinity",
  "this",
  "new",
  "typeof",
  "void",
  "in",
  "of",
  "instanceof",
  "return",
]);

/** Collect watch keys: full expr + root identifiers / paths referenced. */
export function collectDeps(expr: string): string[] {
  const deps = new Set<string>([expr]);
  const re = /[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(expr))) {
    const path = match[0];
    if (KEYWORDS.has(path.split(".")[0])) {
      continue;
    }
    deps.add(path);
    deps.add(path.split(".")[0]);
  }
  return [...deps];
}

export const evaluateExpression = (raw: string, thisArg: any): Evaluated => {
  const match = raw.match(/\{\{(.+?)\}\}/);
  if (!match) {
    return { raw, value: raw.trim(), deps: [] };
  }

  const expr = match[1].trim();
  const fn = new Function(`with(this){return (${expr});}`);
  return {
    raw,
    value: fn.call(thisArg),
    deps: collectDeps(expr),
  };
};

export class AttributeRegistry {
  handlers: (typeof AttributeHandler)[] = [];

  register(...h: (typeof AttributeHandler)[]): this {
    this.handlers.push(...h);
    return this;
  }

  apply(el: Element, attr: Attr, ctx: Context): void {
    // Capture before handlers mutate/remove the live Attr value
    const raw = attr.value;
    const expr = ctx.evaluate(raw, ctx.host);
    for (const handler of this.handlers) {
      if (handler.test(attr.name, ctx)) {
        const h = new handler(el, attr, expr, ctx);
        h.init();
        // Re-evaluate on any dep change so expressions like `count + 1` stay correct
        ctx.watch(expr, () => {
          const next = ctx.evaluate(raw, ctx.host);
          h.evaluated = next;
          h.update(next.value);
        });
        return;
      }
    }

    console.warn(`no handler matched ${attr.name}`);
  }
}
