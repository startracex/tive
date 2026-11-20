export type Key = string | number;

export interface PatchItem {
  context: any;
}

export type RenderFn = (context: any) => ChildNode[];
export type GetKeyFn = (context: any) => Key;
export type OnReuseFn = (oldContext: any, newContext: any) => void;

export class KeyedListPatcher {
  private render: RenderFn;
  private getKey: GetKeyFn;
  private onReuse: OnReuseFn;
  private parent: Node | null = null;
  private anchor: Comment | null = null;
  private currentMap = new Map<Key, { nodes: ChildNode[]; context: any }>();

  constructor(render: RenderFn, getKey: GetKeyFn, onReuse: OnReuseFn = () => {}) {
    this.render = render;
    this.getKey = getKey;
    this.onReuse = onReuse;
  }

  mount(parent: Node, anchor: Comment) {
    this.parent = parent;
    this.anchor = anchor;
  }

  get mounted() {
    return !!(this.parent && this.anchor && this.anchor.parentNode === this.parent);
  }

  patch(list: PatchItem[]) {
    if (!this.parent || !this.anchor || this.anchor.parentNode !== this.parent) {
      throw new Error("patcher is not mounted");
    }

    const oldKeys = Array.from(this.currentMap.keys());
    const newMap = new Map<Key, { nodes: ChildNode[]; context: any }>();
    const sourceIndices: number[] = [];

    const patchPairs = list.map((item) => {
      const key = this.getKey(item.context);
      const reused = this.currentMap.get(key);
      let nodes: ChildNode[];
      let context = item.context;

      if (reused) {
        this.onReuse(reused.context, item.context);
        nodes = reused.nodes;
        context = reused.context;
        this.currentMap.delete(key);
        sourceIndices.push(oldKeys.indexOf(key));
      } else {
        nodes = this.render(item.context);
        sourceIndices.push(-1);
      }

      newMap.set(key, { nodes, context });
      return { key, nodes };
    });

    const stable = getLIS(sourceIndices);
    let s = stable.length - 1;

    for (let i = patchPairs.length - 1; i >= 0; i--) {
      const { nodes } = patchPairs[i];
      const nextAnchor = i + 1 < patchPairs.length ? patchPairs[i + 1].nodes[0] : this.anchor;

      if (sourceIndices[i] === -1 || i !== stable[s]) {
        nodes.forEach((n) => this.parent!.insertBefore(n, nextAnchor));
      } else {
        s--;
      }
    }

    this.currentMap.forEach(({ nodes }) => nodes.forEach((n) => n.remove()));

    this.currentMap = newMap;
  }
}

function getLIS(arr: number[]): number[] {
  const p = arr.slice();
  const result: number[] = [];

  for (let i = 0; i < arr.length; i++) {
    const val = arr[i];
    if (val === -1) {
      continue;
    }

    if (result.length === 0 || arr[result[result.length - 1]] < val) {
      p[i] = result.length ? result[result.length - 1] : -1;
      result.push(i);
      continue;
    }

    let u = 0,
      v = result.length - 1;
    while (u < v) {
      const m = (u + v) >> 1;
      if (arr[result[m]] < val) {
        u = m + 1;
      } else {
        v = m;
      }
    }

    if (val < arr[result[u]]) {
      if (u > 0) {
        p[i] = result[u - 1];
      }
      result[u] = i;
    }
  }

  let len = result.length;
  if (len === 0) {
    return [];
  }
  let k = result[len - 1];
  const seq = Array(len);
  while (len-- > 0) {
    seq[len] = k;
    k = p[k];
  }
  return seq;
}
