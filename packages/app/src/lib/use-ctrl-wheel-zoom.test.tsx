// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "../test-utils/render-hook.js";
import { useCtrlWheelZoom } from "./use-ctrl-wheel-zoom.js";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("useCtrlWheelZoom", () => {
  it("非passiveのネイティブリスナーで Ctrl/⌘+ホイールのページ拡大を止めてズームする", () => {
    const element = document.createElement("div");
    document.body.append(element);
    const addSpy = vi.spyOn(element, "addEventListener");
    const onZoom = vi.fn();
    const { unmount } = renderHook(() => useCtrlWheelZoom({ current: element }, onZoom, true));

    expect(addSpy).toHaveBeenCalledWith(
      "wheel",
      expect.any(Function),
      expect.objectContaining({ passive: false }),
    );

    const zoomIn = new WheelEvent("wheel", { deltaY: -10, ctrlKey: true, clientX: 3, clientY: 4, cancelable: true });
    element.dispatchEvent(zoomIn);
    expect(zoomIn.defaultPrevented).toBe(true);
    expect(onZoom).toHaveBeenCalledWith(1, { clientX: 3, clientY: 4 });

    const scroll = new WheelEvent("wheel", { deltaY: 10, cancelable: true });
    element.dispatchEvent(scroll);
    expect(scroll.defaultPrevented).toBe(false);
    expect(onZoom).toHaveBeenCalledTimes(1);

    unmount();
    const afterUnmount = new WheelEvent("wheel", { deltaY: 10, metaKey: true, cancelable: true });
    element.dispatchEvent(afterUnmount);
    expect(onZoom).toHaveBeenCalledTimes(1);
  });

  it("要素が後から現れたら有効化時に取り付ける", () => {
    const ref: { current: HTMLDivElement | null } = { current: null };
    const onZoom = vi.fn();
    const hook = renderHook(
      ({ enabled }: { enabled: boolean }) => useCtrlWheelZoom(ref, onZoom, enabled),
      { initialProps: { enabled: false } },
    );
    const element = document.createElement("div");
    ref.current = element;
    hook.rerender({ enabled: true });
    element.dispatchEvent(new WheelEvent("wheel", { deltaY: 10, ctrlKey: true, cancelable: true }));
    expect(onZoom).toHaveBeenCalledWith(-1, { clientX: 0, clientY: 0 });
    hook.unmount();
  });
});
