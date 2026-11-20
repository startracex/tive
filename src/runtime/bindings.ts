export function setAttr(el: Element, name: string, value: any) {
  if (value === null || value === undefined || value === false) {
    el.removeAttribute(name);
    return;
  }
  el.setAttribute(name, value === true ? "" : String(value));
}

export function setBoolAttr(el: Element, name: string, value: any) {
  if (value) {
    el.setAttribute(name, "");
  } else {
    el.removeAttribute(name);
  }
}

export function setProp(el: Element, name: string, value: any) {
  (el as any)[name] = value;
}

export function bindEvent(el: Element, type: string, value: any): () => void {
  if (typeof value !== "function") {
    return () => {};
  }
  const listener = typeof value.bind === "function" ? value.bind(null) : value;
  // caller should bind host; we accept already-bound or raw function
  el.addEventListener(type, listener);
  return () => el.removeEventListener(type, listener);
}

export function applyRest(
  el: Element,
  value: Record<string, any> | null,
  prev: Record<string, any>,
  skip: Set<string>,
) {
  if (typeof value !== "object" || value === null) {
    return prev;
  }
  const keys = new Set([...Object.keys(prev), ...Object.keys(value)]);
  for (const key of keys) {
    if (skip.has(key)) {
      continue;
    }
    if (prev[key] !== value[key]) {
      (el as any)[key] = value[key];
    }
  }
  return { ...value };
}
