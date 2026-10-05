import { useCallback, useEffect, useRef } from "react";

export interface WindowPointerHandlers {
  onMove: (event: PointerEvent) => void;
  /** pointerup。ドラッグを確定する */
  onEnd: (event: PointerEvent) => void;
  /** pointercancel(OSのジェスチャー・タッチ中断など)。確定せずに取り消す */
  onCancel?: (event: PointerEvent) => void;
}

/**
 * ドラッグ中のポインタを window で追跡する。pointerup / pointercancel のどちらでも
 * リスナーを外し、返り値の関数でも途中で外せる。
 */
export function trackWindowPointer(handlers: WindowPointerHandlers): () => void {
  let active = true;
  const stop = () => {
    if (!active) {
      return;
    }
    active = false;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
  };
  const onMove = (event: Event) => {
    handlers.onMove(event as PointerEvent);
  };
  const onUp = (event: Event) => {
    stop();
    handlers.onEnd(event as PointerEvent);
  };
  const onCancel = (event: Event) => {
    stop();
    handlers.onCancel?.(event as PointerEvent);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onCancel);
  return stop;
}

/**
 * コンポーネント内で使う trackWindowPointer。アンマウント時に追跡中のリスナーをすべて外す。
 */
export function usePointerTracking(): (handlers: WindowPointerHandlers) => () => void {
  const activeRef = useRef(new Set<() => void>());

  useEffect(() => {
    const active = activeRef.current;
    return () => {
      for (const stop of [...active]) {
        stop();
      }
      active.clear();
    };
  }, []);

  return useCallback((handlers: WindowPointerHandlers) => {
    const active = activeRef.current;
    const stop = trackWindowPointer({
      onMove: handlers.onMove,
      onEnd: (event) => {
        active.delete(stop);
        handlers.onEnd(event);
      },
      onCancel: (event) => {
        active.delete(stop);
        handlers.onCancel?.(event);
      },
    });
    active.add(stop);
    return () => {
      active.delete(stop);
      stop();
    };
  }, []);
}
