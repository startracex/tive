import { beforeEach, describe, expect, it, vi } from "vitest";
import { html, Tive } from "../src/index.js";

describe("tive compiled runtime", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  it("updates text and attribute expressions from deps", () => {
    class App extends Tive {
      static properties = { count: true };
      static template = html`
        <p>Count: {{count}}</p>
        <span data-n="{{count + count}}"></span>
      `;
      count = 1;
    }

    const app = new App().mount(root);
    expect(root.textContent).toContain("Count: 1");
    expect(root.querySelector("[data-n]")!.getAttribute("data-n")).toBe("2");

    app.count = 3;
    expect(root.textContent).toContain("Count: 3");
    expect(root.querySelector("[data-n]")!.getAttribute("data-n")).toBe("6");
  });

  it("binds events and boolean / property attrs", () => {
    const spy = vi.fn();

    class App extends Tive {
      static properties = { disabled: true, title: true };
      static template = html`
        <button
          @click="{{onClick}}"
          ?disabled="{{disabled}}"
        >
          go
        </button>
        <input .value="{{title}}" />
      `;
      disabled = false;
      title = "hello";
      onClick() {
        spy();
      }
    }

    const app = new App().mount(root);
    const button = root.querySelector("button")!;
    const input = root.querySelector("input")!;

    expect(input.value).toBe("hello");
    button.click();
    expect(spy).toHaveBeenCalledTimes(1);

    app.disabled = true;
    expect(button.hasAttribute("disabled")).toBe(true);
    app.title = "world";
    expect(input.value).toBe("world");
  });

  it("toggles if blocks", () => {
    class App extends Tive {
      static properties = { show: true };
      static template = html`
        <template if="{{show}}"><p>visible</p></template>
      `;
      show = true;
    }

    const app = new App().mount(root);
    expect(root.textContent).toContain("visible");
    app.show = false;
    expect(root.textContent).not.toContain("visible");
    app.show = true;
    expect(root.textContent).toContain("visible");
  });

  it("patches keyed lists and updates reused item labels", () => {
    class App extends Tive {
      static properties = { items: true };
      static template = html`
        <ul>
          <template
            for="{{item of items}}"
            key="{{item.id}}"
          >
            <li>{{item.label}}</li>
          </template>
        </ul>
      `;
      items = [
        { id: 1, label: "a" },
        { id: 2, label: "b" },
      ];
    }

    const app = new App().mount(root);
    const lis = () => [...root.querySelectorAll("li")];
    expect(lis().map((li) => li.textContent)).toEqual(["a", "b"]);

    const first = lis()[0];
    app.items = [
      { id: 1, label: "a!" },
      { id: 2, label: "b" },
    ];
    expect(lis()[0]).toBe(first);
    expect(lis().map((li) => li.textContent)).toEqual(["a!", "b"]);
  });

  it("passes props into child components", () => {
    class Badge extends Tive {
      static properties = { label: true };
      static template = html`
        <span>badge:{{label}}</span>
      `;
      label = "";
    }

    class App extends Tive {
      static properties = { title: true };
      static components = { "x-badge": Badge };
      static template = html`
        <x-badge label="{{title}}"></x-badge>
      `;
      title = "hi";
    }

    const app = new App().mount(root);
    expect(root.textContent).toContain("badge:hi");
    app.title = "yo";
    expect(root.textContent).toContain("badge:yo");
  });

  it("unmount removes DOM and stops events", () => {
    const spy = vi.fn();

    class App extends Tive {
      static template = html`
        <button @click="{{onClick}}">x</button>
      `;
      onClick() {
        spy();
      }
    }

    const app = new App().mount(root);
    const button = root.querySelector("button")!;
    button.click();
    expect(spy).toHaveBeenCalledTimes(1);

    app.unmount();
    expect(root.querySelector("button")).toBeNull();
    button.click();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
