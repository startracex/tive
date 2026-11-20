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
  "var",
  "let",
  "const",
  "function",
  "class",
  "if",
  "else",
  "for",
  "while",
  "do",
  "switch",
  "case",
  "break",
  "continue",
  "default",
  "try",
  "catch",
  "throw",
  "finally",
  "with",
  "debugger",
  "delete",
  "yield",
  "await",
  "async",
]);

export interface CompiledExpr {
  source: string;
  deps: string[];
  get(host: any): any;
}

/** Collect identifier / member-path deps from an expression source. */
export function collectDeps(expr: string): string[] {
  const deps = new Set<string>();
  const re = /[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(expr))) {
    const path = match[0];
    const root = path.split(".")[0];
    if (KEYWORDS.has(root)) {
      continue;
    }
    deps.add(path);
    deps.add(root);
  }
  return [...deps];
}

export function compileExpr(source: string): CompiledExpr {
  const trimmed = source.trim();
  const deps = collectDeps(trimmed);
  const fn = new Function(`with(this){return(${trimmed});}`);
  return {
    source: trimmed,
    deps,
    get(host: any) {
      return fn.call(host);
    },
  };
}

/** Parse a raw attribute/text value that may contain `{{ expr }}`. */
export function compileMustacheValue(raw: string): CompiledExpr | null {
  const match = raw.match(/^\s*\{\{(.+?)\}\}\s*$/);
  if (!match) {
    return null;
  }
  return compileExpr(match[1]);
}

export function compileMustacheText(raw: string): {
  segments: { type: "static" | "dynamic"; value?: string; expr?: CompiledExpr }[];
  deps: string[];
} {
  const segments: { type: "static" | "dynamic"; value?: string; expr?: CompiledExpr }[] = [];
  const deps = new Set<string>();
  const re = /\{\{(.+?)\}\}/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(raw))) {
    if (match.index > last) {
      segments.push({ type: "static", value: raw.slice(last, match.index) });
    }
    const expr = compileExpr(match[1]);
    expr.deps.forEach((d) => deps.add(d));
    segments.push({ type: "dynamic", expr });
    last = match.index + match[0].length;
  }

  if (last < raw.length) {
    segments.push({ type: "static", value: raw.slice(last) });
  }

  return { segments, deps: [...deps] };
}
