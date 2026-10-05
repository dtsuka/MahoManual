// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnnotationFile } from "@mahomanual/core/schema";
import { flush, renderHook } from "../test-utils/render-hook.js";
import { useAnnotationDocument } from "./use-annotation-document.js";
import { useAnnotationSync } from "./use-annotation-sync.js";

function annotationWithWidth(width: number): AnnotationFile {
  return {
    version: 1,
    canvas: { width, height: 500 },
    objects: [
      { id: "b1", type: "badge", source: "manual", n: 1, at: { x: 10, y: 10 } },
    ],
  };
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners: Array<(event: MessageEvent) => void> = [];
  closed = false;
  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(_type: string, listener: (event: MessageEvent) => void) {
    this.listeners.push(listener);
  }
  close() {
    this.closed = true;
  }
  emit(path: string) {
    for (const listener of this.listeners) {
      listener({ data: JSON.stringify({ type: "change", path }) } as MessageEvent);
    }
  }
}

type Route = (url: string, init?: RequestInit) => Promise<Response> | undefined;

let routes: Route[] = [];
let calls: Array<{ url: string; method: string }> = [];

function getCalls(fragment: string, method = "GET") {
  return calls.filter((call) => call.url.includes(fragment) && call.method === method);
}

beforeEach(() => {
  routes = [];
  calls = [];
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? "GET" });
    for (const route of routes) {
      const response = route(url, init);
      if (response) {
        return response;
      }
    }
    if (url.endsWith("/manual")) {
      return Promise.resolve(jsonResponse({ body: "", annotations: ["a", "b"] }));
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

interface HarnessProps {
  annotationId: string;
  canSave?: () => boolean;
  onBack?: () => void;
}

function useHarness({ annotationId, canSave, onBack }: HarnessProps) {
  const document = useAnnotationDocument();
  const sync = useAnnotationSync({
    project: "p",
    annotationId,
    document,
    onBack,
    canSave,
    resetOnLoad: () => {},
    onPayloadApplied: () => {},
    onLoadError: () => {},
    onError: () => {},
    onStatus: () => {},
  });
  return { document, sync };
}

function payload(annotation: AnnotationFile) {
  return { annotation, naturalSizes: {} };
}

describe("useAnnotationSync: 読み込み", () => {
  it("注釈を切り替えたあとに古い読み込みが返っても、新しい注釈を上書きしない", async () => {
    const slowA = deferred<Response>();
    routes.push((url) => (url.endsWith("/annotations/a") ? slowA.promise : undefined));
    routes.push((url) =>
      url.endsWith("/annotations/b")
        ? Promise.resolve(jsonResponse(payload(annotationWithWidth(2000))))
        : undefined,
    );

    const hook = renderHook(useHarness, { initialProps: { annotationId: "a" } });
    hook.rerender({ annotationId: "b" });
    await flush();
    expect(hook.result.current.document.annotation?.canvas.width).toBe(2000);

    slowA.resolve(jsonResponse(payload(annotationWithWidth(1000))));
    await flush();
    expect(hook.result.current.document.annotation?.canvas.width).toBe(2000);
    hook.unmount();
  });
});

describe("useAnnotationSync: 保存", () => {
  it("保存中に続けた編集は失われず、自分の保存のエコーで履歴も消えない", async () => {
    const saved = annotationWithWidth(1000);
    routes.push((url, init) =>
      url.endsWith("/annotations/a") && (init?.method ?? "GET") === "GET"
        ? Promise.resolve(jsonResponse(payload(saved)))
        : undefined,
    );
    const pendingSave = deferred<Response>();
    routes.push((url, init) =>
      url.endsWith("/annotations/a") && init?.method === "PUT" ? pendingSave.promise : undefined,
    );

    const hook = renderHook(useHarness, { initialProps: { annotationId: "a" } });
    await flush();
    const { document } = hook.result.current;

    act(() => {
      document.applyLocalChange((current) => ({ ...current, canvas: { width: 1100, height: 500 } }));
    });
    let savePromise!: Promise<void>;
    act(() => {
      savePromise = hook.result.current.sync.handleSave();
    });
    act(() => {
      hook.result.current.document.applyLocalChange((current) => ({
        ...current,
        canvas: { width: 1200, height: 500 },
      }));
    });
    expect(getCalls("/annotations/a", "PUT")).toHaveLength(1);
    pendingSave.resolve(jsonResponse({ annotation: annotationWithWidth(1100) }));
    await act(async () => {
      await savePromise;
    });

    expect(hook.result.current.document.annotation?.canvas.width).toBe(1200);
    expect(hook.result.current.document.dirty).toBe(true);

    // 自分の保存によるファイル変更通知(エコー)
    routes.unshift((url, init) =>
      url.endsWith("/annotations/a") && (init?.method ?? "GET") === "GET"
        ? Promise.resolve(jsonResponse(payload(annotationWithWidth(1100))))
        : undefined,
    );
    act(() => {
      FakeEventSource.instances.at(-1)!.emit("annotations/a.json");
    });
    await flush();

    expect(hook.result.current.document.annotation?.canvas.width).toBe(1200);
    expect(hook.result.current.document.canUndo).toBe(true);
    hook.unmount();
  });

  it("保存できない状態(切り抜き調整中など)では保存要求を送らない", async () => {
    routes.push((url, init) =>
      url.endsWith("/annotations/a") && (init?.method ?? "GET") === "GET"
        ? Promise.resolve(jsonResponse(payload(annotationWithWidth(1000))))
        : undefined,
    );
    const hook = renderHook(useHarness, {
      initialProps: { annotationId: "a", canSave: () => false },
    });
    await flush();
    act(() => {
      hook.result.current.document.applyLocalChange((current) => ({
        ...current,
        canvas: { width: 1100, height: 500 },
      }));
    });
    await act(async () => {
      await hook.result.current.sync.handleSave();
    });
    expect(getCalls("/annotations/a", "PUT")).toHaveLength(0);
    expect(hook.result.current.document.dirty).toBe(true);
    hook.unmount();
  });
});

describe("useAnnotationSync: 未保存のまま離れる", () => {
  it("破棄して離れるときに注釈を読み直さない", async () => {
    routes.push((url, init) =>
      url.endsWith("/annotations/a") && (init?.method ?? "GET") === "GET"
        ? Promise.resolve(jsonResponse(payload(annotationWithWidth(1000))))
        : undefined,
    );
    const onBack = vi.fn();
    const hook = renderHook(useHarness, { initialProps: { annotationId: "a", onBack } });
    await flush();
    act(() => {
      hook.result.current.document.applyLocalChange((current) => ({
        ...current,
        canvas: { width: 1100, height: 500 },
      }));
    });
    act(() => {
      hook.result.current.sync.requestNavigation("back");
    });
    expect(hook.result.current.sync.pendingNavigation).toBe("back");
    const loadsBefore = getCalls("/annotations/a").length;

    await act(async () => {
      await hook.result.current.sync.completePendingNavigation("discard");
    });
    await flush();

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(getCalls("/annotations/a")).toHaveLength(loadsBefore);
    hook.unmount();
  });
});
