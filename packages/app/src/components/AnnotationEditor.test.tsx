// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnnotationFile } from "@mahomanual/core/schema";
import { flush } from "../test-utils/render-hook.js";
import { AnnotationEditor } from "./AnnotationEditor.js";

function annotation(): AnnotationFile {
  return {
    version: 1,
    canvas: { width: 1000, height: 500 },
    objects: [
      {
        id: "image-1",
        type: "image",
        source: "manual",
        src: "img/raw/base.png",
        rect: { x: 0, y: 0, w: 100, h: 100 },
        crop: { x: 0, y: 0, w: 1000, h: 500 },
      },
      {
        id: "text-1",
        type: "text",
        source: "manual",
        content: "元の文字",
        at: { x: 10, y: 10 },
        rect: { x: 10, y: 10, w: 20, h: 10 },
      },
      { id: "badge-1", type: "badge", source: "manual", n: 1, at: { x: 50, y: 50 } },
    ],
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

class FakeEventSource {
  addEventListener() {}
  close() {}
}

class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

type Handler = (url: string, init: RequestInit | undefined) => Response | undefined;
let handlers: Handler[] = [];
let calls: Array<{ url: string; method: string; body?: unknown }> = [];

function requests(fragment: string, method: string) {
  return calls.filter((call) => call.url.endsWith(fragment) && call.method === method);
}

function annotationGet(payloads: Record<string, unknown>): Handler {
  return (url, init) => {
    if ((init?.method ?? "GET") !== "GET") {
      return undefined;
    }
    const match = url.match(/\/annotations\/([^/]+)$/);
    if (!match) {
      return undefined;
    }
    const payload = payloads[decodeURIComponent(match[1]!)];
    return payload ? jsonResponse(payload) : undefined;
  };
}

beforeEach(() => {
  handlers = [];
  calls = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    for (const handler of handlers) {
      const response = handler(url, init);
      if (response) {
        return response;
      }
    }
    if (url.endsWith("/manual")) {
      return jsonResponse({ body: "", annotations: ["a", "b"] });
    }
    if (method === "PUT" && /\/annotations\/[^/]+$/.test(url)) {
      return jsonResponse({ annotation: JSON.parse(String(init?.body)) });
    }
    return jsonResponse({ error: `unexpected ${method} ${url}` }, 500);
  });
});

const mountedRoots: Root[] = [];

afterEach(() => {
  // 失敗したテストのリスナーが次のテストへ残らないよう必ずアンマウントする
  for (const root of mountedRoots.splice(0)) {
    act(() => root.unmount());
  }
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

interface Rendered {
  container: HTMLElement;
  rerender: (annotationId: string) => void;
  unmount: () => void;
}

async function renderEditor(annotationId = "a"): Promise<Rendered> {
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  mountedRoots.push(root);
  const render = (id: string) => {
    act(() => {
      root.render(
        <MemoryRouter>
          <AnnotationEditor project="p" annotationId={id} />
        </MemoryRouter>,
      );
    });
  };
  render(annotationId);
  await flush();
  return {
    container,
    rerender: render,
    unmount: () => {
      const index = mountedRoots.indexOf(root);
      if (index >= 0) {
        mountedRoots.splice(index, 1);
        act(() => root.unmount());
      }
    },
  };
}

function byTestId(container: HTMLElement, id: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
}

function click(element: Element | null) {
  if (!element) {
    throw new Error("element not found");
  }
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

function pressSave(target: EventTarget = window) {
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key: "s", code: "KeyS", metaKey: true, bubbles: true, cancelable: true }),
    );
  });
}

function pressKey(key: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, code: key, bubbles: true, cancelable: true }));
  });
}

const defaultPayload = {
  annotation: annotation(),
  naturalSizes: { "img/raw/base.png": { w: 1000, h: 500 } },
  theme: {},
  defaults: {},
};

describe("AnnotationEditor: 切り抜き調整中の保存", () => {
  it("切り抜き調整中は ⌘S でも保存ボタンでも保存せず、取消後は元の配置で保存する", async () => {
    handlers.push(annotationGet({ a: defaultPayload }));
    const { container, unmount } = await renderEditor();

    click(byTestId(container, "object-item-image-1"));
    click(byTestId(container, "open-visual-crop"));
    expect(container.textContent).toContain("クロップを編集中");

    pressSave();
    click(byTestId(container, "save-button"));
    await flush();
    expect(requests("/annotations/a", "PUT")).toHaveLength(0);

    pressKey("Escape");
    pressSave();
    await flush();
    const puts = requests("/annotations/a", "PUT");
    expect(puts).toHaveLength(1);
    const sent = puts[0]!.body as AnnotationFile;
    expect(sent.objects.find((obj) => obj.id === "image-1")).toMatchObject({
      rect: { x: 0, y: 0, w: 100, h: 100 },
      crop: { x: 0, y: 0, w: 1000, h: 500 },
    });
    unmount();
  });
});

describe("AnnotationEditor: 文字の直接編集中の保存", () => {
  it("直接編集中に ⌘S すると入力中の文字が保存される", async () => {
    handlers.push(annotationGet({ a: defaultPayload }));
    const { container, unmount } = await renderEditor();

    const textElement = container.querySelector('[data-mm-id="text-1"]');
    act(() => {
      textElement!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    });
    const textarea = byTestId(container, "inline-text-editor") as HTMLTextAreaElement | null;
    expect(textarea).not.toBeNull();

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(textarea, "入力した文字");
      textarea!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    pressSave(textarea!);
    await flush();

    const puts = requests("/annotations/a", "PUT");
    expect(puts).toHaveLength(1);
    const sent = puts[0]!.body as AnnotationFile;
    expect(sent.objects.find((obj) => obj.id === "text-1")).toMatchObject({ content: "入力した文字" });
    unmount();
  });
});

describe("AnnotationEditor: 操作エラー", () => {
  it("保存に失敗しても編集画面は残り、閉じられるエラーバナーを表示する", async () => {
    handlers.push(annotationGet({ a: defaultPayload }));
    handlers.push((url, init) =>
      init?.method === "PUT" && url.endsWith("/annotations/a")
        ? jsonResponse({ error: "保存先に書き込めません" }, 500)
        : undefined,
    );
    const { container, unmount } = await renderEditor();

    pressSave();
    await flush();

    expect(byTestId(container, "canvas-viewport")).not.toBeNull();
    const banner = byTestId(container, "operation-error-banner");
    expect(banner?.textContent).toContain("保存先に書き込めません");

    click(byTestId(container, "dismiss-operation-error"));
    expect(byTestId(container, "operation-error-banner")).toBeNull();
    expect(byTestId(container, "canvas-viewport")).not.toBeNull();
    unmount();
  });

  it("注釈を読み込めないときは画面全体にエラーを表示する", async () => {
    handlers.push((url, init) =>
      (init?.method ?? "GET") === "GET" && url.endsWith("/annotations/a")
        ? jsonResponse({ error: "not found" }, 404)
        : undefined,
    );
    const { container, unmount } = await renderEditor();
    expect(container.textContent).toContain("注釈の読み込みに失敗しました");
    expect(byTestId(container, "canvas-viewport")).toBeNull();
    unmount();
  });
});

describe("AnnotationEditor: 注釈の切り替え", () => {
  it("別の注釈へ切り替えると選択状態がリセットされる", async () => {
    handlers.push(annotationGet({
      a: defaultPayload,
      b: { ...defaultPayload, annotation: { ...annotation(), canvas: { width: 800, height: 400 } } },
    }));
    const { container, rerender, unmount } = await renderEditor("a");

    click(byTestId(container, "object-item-badge-1"));
    expect(container.querySelector('[data-mm-id="badge-1"]')?.classList.contains("is-selected")).toBe(true);

    rerender("b");
    await flush();

    expect(container.querySelector('[data-mm-id="badge-1"]')).not.toBeNull();
    expect(container.querySelector('[data-mm-id="badge-1"]')?.classList.contains("is-selected")).toBe(false);
    unmount();
  });
});

describe("AnnotationEditor: プロジェクト既定スタイルの保存", () => {
  it("最新のテーマと既定スタイルを取得し、選択中の種類だけを更新して送る", async () => {
    handlers.push(annotationGet({
      a: { ...defaultPayload, theme: { color: "#111111" }, defaults: {} },
    }));
    handlers.push((url, init) => {
      if (!url.endsWith("/theme")) {
        return undefined;
      }
      if ((init?.method ?? "GET") === "GET") {
        return jsonResponse({ theme: { color: "#222222" }, defaults: { frame: { strokeWidth: 4 } } });
      }
      const body = JSON.parse(String(init?.body)) as { defaults?: unknown };
      return jsonResponse({ theme: { color: "#222222" }, defaults: body.defaults });
    });
    const { container, unmount } = await renderEditor();

    click(byTestId(container, "object-item-badge-1"));
    click(byTestId(container, "project-default-save"));
    await flush();

    const puts = requests("/theme", "PUT");
    expect(puts).toHaveLength(1);
    const body = puts[0]!.body as { color?: string; defaults?: Record<string, unknown> };
    expect(body.color).toBe("#222222");
    expect(body.defaults?.frame).toEqual({ strokeWidth: 4 });
    expect(body.defaults?.badge).toBeDefined();
    unmount();
  });
});
