export class ComponentRegistry {
  private components = new Map<string, new () => any>();

  constructor(components: Record<string, new () => any> = {}) {
    for (const [tag, ctor] of Object.entries(components)) {
      this.define(tag, ctor);
    }
  }

  define(tag: string, ctor: new () => any) {
    this.components.set(tag.toLowerCase(), ctor);
  }

  get(tag: string): (new () => any) | undefined {
    return this.components.get(tag.toLowerCase());
  }

  has(tag: string) {
    return this.components.has(tag.toLowerCase());
  }
}
