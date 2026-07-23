import { useCallback, useEffect, useRef, useState } from "react";
import type { AnnotationFile } from "@mahomanual/core/schema";
import { fitCanvasZoom } from "./annotation-viewport.js";

interface UseEditorViewportOptions {
  annotation: AnnotationFile | null;
  annotationId: string;
}

interface ZoomAnchor {
  clientX: number;
  clientY: number;
}

/**
 * キャンバスの表示倍率・パン・fit 表示を閉じるビューポート状態。
 * ズーム変更時はアンカー位置(ポインタ位置)を保ったままスクロール量を補正する。
 */
export function useEditorViewport({ annotation, annotationId }: UseEditorViewportOptions) {
  const [zoom, setZoom] = useState(25);
  const [zoomMode, setZoomMode] = useState<"fit" | "manual">("fit");
  const [isSpaceHeld, setIsSpaceHeld] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [viewportReady, setViewportReady] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasViewportRef = useRef<HTMLDivElement>(null);
  const spaceHeldRef = useRef(false);

  const setViewportZoom = useCallback((
    nextZoom: number,
    mode: "fit" | "manual",
    anchor?: ZoomAnchor,
  ) => {
    const viewport = canvasViewportRef.current;
    const wrap = wrapRef.current;
    const before = wrap?.getBoundingClientRect();
    const anchorPct = anchor && before
      ? {
          x: (anchor.clientX - before.left) / before.width,
          y: (anchor.clientY - before.top) / before.height,
        }
      : null;
    setZoom(nextZoom);
    setZoomMode(mode);
    if (!viewport || !anchor || !anchorPct) {
      return;
    }
    requestAnimationFrame(() => {
      const after = wrapRef.current?.getBoundingClientRect();
      if (!after) {
        return;
      }
      const nextClientX = after.left + after.width * anchorPct.x;
      const nextClientY = after.top + after.height * anchorPct.y;
      viewport.scrollLeft += nextClientX - anchor.clientX;
      viewport.scrollTop += nextClientY - anchor.clientY;
    });
  }, []);

  const showActualSize = useCallback(() => setViewportZoom(100, "manual"), [setViewportZoom]);

  const showFit = useCallback(() => {
    const viewport = canvasViewportRef.current;
    if (!viewport || !annotation) {
      return;
    }
    setViewportZoom(fitCanvasZoom(annotation.canvas, {
      width: viewport.clientWidth,
      height: viewport.clientHeight,
    }, 64), "fit");
  }, [annotation, setViewportZoom]);

  const setSpaceHeld = useCallback((held: boolean) => {
    spaceHeldRef.current = held;
    setIsSpaceHeld(held);
  }, []);

  const resetForLoad = useCallback(() => {
    setViewportReady(false);
    setZoomMode("fit");
  }, []);

  useEffect(() => {
    const viewport = canvasViewportRef.current;
    if (!viewport || !annotation || zoomMode !== "fit") {
      return;
    }
    const update = () => {
      setZoom(fitCanvasZoom(annotation.canvas, {
        width: viewport.clientWidth,
        height: viewport.clientHeight,
      }, 64));
      requestAnimationFrame(() => setViewportReady(true));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [annotation?.canvas.width, annotation?.canvas.height, annotationId, zoomMode]);

  return {
    zoom,
    zoomMode,
    isSpaceHeld,
    isPanning,
    setIsPanning,
    viewportReady,
    wrapRef,
    canvasViewportRef,
    spaceHeldRef,
    setViewportZoom,
    showActualSize,
    showFit,
    setSpaceHeld,
    resetForLoad,
  };
}

export type EditorViewport = ReturnType<typeof useEditorViewport>;
