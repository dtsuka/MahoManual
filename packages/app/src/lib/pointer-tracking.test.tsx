// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "../test-utils/render-hook.js";
import { trackWindowPointer, usePointerTracking } from "./pointer-tracking.js";

function pointer(type: string, clientX = 0, clientY = 0): Event {
  return new MouseEvent(type, { clientX, clientY, bubbles: true });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("trackWindowPointer", () => {
  it("pointerup で終了しリスナーを外す", () => {
    const onMove = vi.fn();
    const onEnd = vi.fn();
    trackWindowPointer({ onMove, onEnd });
    window.dispatchEvent(pointer("pointermove", 5, 5));
    window.dispatchEvent(pointer("pointerup", 6, 6));
    window.dispatchEvent(pointer("pointermove", 7, 7));
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("pointercancel でも終了してリスナーを外し、確定(onEnd)はしない", () => {
    const onMove = vi.fn();
    const onEnd = vi.fn();
    const onCancel = vi.fn();
    trackWindowPointer({ onMove, onEnd, onCancel });
    window.dispatchEvent(pointer("pointercancel"));
    window.dispatchEvent(pointer("pointermove", 7, 7));
    window.dispatchEvent(pointer("pointerup", 7, 7));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onMove).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it("返り値の関数で途中で外せる", () => {
    const onMove = vi.fn();
    const stop = trackWindowPointer({ onMove, onEnd: vi.fn() });
    stop();
    window.dispatchEvent(pointer("pointermove", 7, 7));
    expect(onMove).not.toHaveBeenCalled();
  });
});

describe("usePointerTracking", () => {
  it("ドラッグ中にアンマウントされたらウィンドウのリスナーを外す", () => {
    const onMove = vi.fn();
    const onEnd = vi.fn();
    const { result, unmount } = renderHook(() => usePointerTracking());
    act(() => {
      result.current({ onMove, onEnd });
    });
    unmount();
    window.dispatchEvent(pointer("pointermove", 1, 1));
    window.dispatchEvent(pointer("pointerup", 1, 1));
    expect(onMove).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });
});
