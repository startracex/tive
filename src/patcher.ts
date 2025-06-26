export type Key = string | number;

export interface PatchItem {
  context: any;
}

export type RenderFn = (context: any) => ChildNode[];
export type GetKeyFn = (context: any) => Key;

export class KeyedListPatcher {
  private render: RenderFn;
  private getKey: GetKeyFn;
  private parent: Node | null = null;
  private anchor: Comment | null = null;
  private currentMap = new Map<Key, ChildNode[]>();

  constructor(render: RenderFn, getKey: GetKeyFn) {
    this.render = render;
    this.getKey = getKey;
  }

  mount(parent: Node, anchor: Comment) {
    this.parent = parent;
    this.anchor = anchor;
  }

  patch(list: PatchItem[]) {
    if (!this.parent || !this.anchor || this.anchor.parentNode !== this.parent) {
      throw new Error("patcher is not mounted");
    }

    const oldKeys = Array.from(this.currentMap.keys());
    const newMap = new Map<Key, ChildNode[]>();
    const sourceIndices: number[] = [];

    const patchPairs = list.map((item) => {
      const key = this.getKey(item.context);
      const reused = this.currentMap.get(key);
      let nodes: ChildNode[];

      if (reused) {
        nodes = reused;
        this.currentMap.delete(key);
        sourceIndices.push(oldKeys.indexOf(key));
      } else {
        nodes = this.render(item.context);
        sourceIndices.push(-1);
      }

      newMap.set(key, nodes);
      return { key, nodes };
    });

    const stable = getLIS(sourceIndices);
    let s = stable.length - 1;

    for (let i = patchPairs.length - 1; i >= 0; i--) {
      const { nodes } = patchPairs[i];
      const nextAnchor = i + 1 < patchPairs.length ? patchPairs[i + 1].nodes[0] : this.anchor;

      if (sourceIndices[i] === -1 || i !== stable[s]) {
        nodes.forEach((n) => this.parent.insertBefore(n, nextAnchor));
      } else {
        s--;
      }
    }

    this.currentMap.forEach((nodes) => nodes.forEach((n) => n.remove()));

    this.currentMap = newMap;
  }
}

function getLIS(arr: number[]): number[] {
  const p = arr.slice();
  const result: number[] = [];

  for (let i = 0; i < arr.length; i++) {
    const val = arr[i];
    if (val === -1) continue;

    if (result.length === 0 || arr[result[result.length - 1]] < val) {
      p[i] = result.length ? result[result.length - 1] : -1;
      result.push(i);
      continue;
    }

    let u = 0,
      v = result.length - 1;
    while (u < v) {
      const m = (u + v) >> 1;
      if (arr[result[m]] < val) u = m + 1;
      else v = m;
    }

    if (val < arr[result[u]]) {
      if (u > 0) p[i] = result[u - 1];
      result[u] = i;
    }
  }

  let len = result.length;
  let k = result[len - 1];
  const seq = Array(len);
  while (len-- > 0) {
    seq[len] = k;
    k = p[k];
  }
  return seq;
}
