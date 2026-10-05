// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "../test-utils/render-hook.js";
import { useManualDocument } from "./use-manual-document.js";

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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

let respond: () => Promise<Response>;
let sentBodies: string[] = [];

beforeEach(() => {
  sentBodies = [];
  respond = () => Promise.resolve(jsonResponse({ ok: true }));
  vi.stubGlobal("fetch", (_input: RequestInfo | URL, init?: RequestInit) => {
    sentBodies.push((JSON.parse(String(init?.body)) as { body: string }).body);
    return respond();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function setup(initial = "A") {
  const hook = renderHook(() => useManualDocument("p"));
  act(() => {
    hook.result.current.resetTo(initial);
  });
  return hook;
}

describe("useManualDocument: 保存", () => {
  it("保存中に入力した内容は未保存のまま残り、自分の保存のエコーでは上書きしない", async () => {
    const { result, unmount } = setup();
    act(() => {
      result.current.updateText("B");
    });
    const pending = deferred<Response>();
    respond = () => pending.promise;
    let saving!: Promise<boolean>;
    act(() => {
      saving = result.current.save();
    });
    act(() => {
      result.current.updateText("C");
    });
    pending.resolve(jsonResponse({ ok: true }));
    await act(async () => {
      await saving;
    });

    expect(sentBodies).toEqual(["B"]);
    expect(result.current.markdownRef.current).toBe("C");
    expect(result.current.dirty).toBe(true);
    expect(result.current.dirtyRef.current).toBe(true);
    // 監視による自分の保存のエコー
    expect(result.current.classifyExternal("B")).toBe("ignore");
    // 本当の外部変更は未保存の編集があるので確認を挟む
    expect(result.current.classifyExternal("外部")).toBe("conflict");
    unmount();
  });

  it("保存中に入力が無ければ未保存を解除する", async () => {
    const { result, unmount } = setup();
    act(() => {
      result.current.updateText("B");
    });
    await act(async () => {
      expect(await result.current.save()).toBe(true);
    });
    expect(result.current.dirty).toBe(false);
    expect(result.current.classifyExternal("外部")).toBe("apply");
    unmount();
  });

  it("保存に失敗したらエラーを表示し、未保存のまま残す", async () => {
    const { result, unmount } = setup();
    act(() => {
      result.current.updateText("B");
    });
    respond = () => Promise.resolve(jsonResponse({ error: "書き込めません" }, 500));
    await act(async () => {
      expect(await result.current.save()).toBe(false);
    });
    expect(result.current.saveError).toContain("書き込めません");
    expect(result.current.dirty).toBe(true);

    act(() => {
      result.current.clearSaveError();
    });
    expect(result.current.saveError).toBeNull();
    unmount();
  });

  it("元の内容へ戻したら未保存ではない", () => {
    const { result, unmount } = setup();
    act(() => {
      result.current.updateText("B");
    });
    expect(result.current.dirty).toBe(true);
    act(() => {
      result.current.updateText("A");
    });
    expect(result.current.dirty).toBe(false);
    unmount();
  });
});

describe("useManualDocument: 未保存で離れる", () => {
  it("未保存のときだけページ離脱を確認する", () => {
    const { result, unmount } = setup();
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    act(() => {
      result.current.updateText("B");
    });
    const dirty = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
    unmount();
  });

  it("戻るときは未保存なら確認し、キャンセルされたら留まる", () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    const { result, unmount } = setup();

    expect(result.current.confirmLeave()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();

    act(() => {
      result.current.updateText("B");
    });
    expect(result.current.confirmLeave()).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(1);

    confirm.mockReturnValue(true);
    expect(result.current.confirmLeave()).toBe(true);
    unmount();
  });
});
