import { useEffect, useRef, type RefObject } from "react";

export type WheelZoomHandler = (
  direction: 1 | -1,
  anchor: { clientX: number; clientY: number },
) => void;

/**
 * Ctrl/⌘+ホイールでキャンバスをズームする。
 * React の onWheel は passive で preventDefault が効かずページ全体が拡大されるため、
 * { passive: false } のネイティブリスナーで受ける。enabled は要素が描画されてから true にする。
 */
export function useCtrlWheelZoom(
  ref: RefObject<HTMLElement | null>,
  onZoom: WheelZoomHandler,
  enabled: boolean,
): void {
  const onZoomRef = useRef(onZoom);
  onZoomRef.current = onZoom;

  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element) {
      return;
    }
    const handler = (event: WheelEvent) => {
      if (!event.metaKey && !event.ctrlKey) {
        return;
      }
      event.preventDefault();
      onZoomRef.current(event.deltaY < 0 ? 1 : -1, {
        clientX: event.clientX,
        clientY: event.clientY,
      });
    };
    element.addEventListener("wheel", handler, { passive: false });
    return () => element.removeEventListener("wheel", handler);
  }, [ref, enabled]);
}
