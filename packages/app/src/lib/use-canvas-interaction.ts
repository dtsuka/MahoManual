import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from "react";
import {
  editableRect,
  hasEditableRect,
  isEditable,
  isLineObject,
  withEditableRect,
} from "@mahomanual/core/annotation-objects";
import type { SnapGuide } from "@mahomanual/core/object-geometry";
import type { AnnotationFile, AnnotationObject } from "@mahomanual/core/schema";
import { createObjectId } from "@mahomanual/core/annotation-ids";
import {
  nearestSegmentIndex,
  resizeRect,
  stickySnap,
  type PointPct,
  type RectPct,
  type StickySnapState,
} from "./geometry.js";
import { objectsInRect, snapThresholdPct } from "./annotation-operations.js";
import { stepZoom } from "./annotation-viewport.js";
import {
  resolveLineDraftPoint,
  roundCreationPct,
  SNAP_THRESHOLD_PCT,
  SNAP_RELEASE_PCT,
} from "./creation-geometry.js";
import {
  resolvePointPointerDownSelection,
  snapDraggedLinePoint,
  translateSelectedPoints,
} from "./line-point-selection.js";
import {
  classifySelectPointerGesture,
  resolveCanvasObjectElement,
  resolveCanvasObjectTargets,
} from "./canvas-hit-test.js";
import {
  nextSelectionIds,
  prepareObjectDragSession,
  type PreparedObjectDragSession,
} from "./object-drag-session.js";
import { commitTranslateDrag, previewTranslateDrag } from "./object-translate-drag.js";
import {
  classifyTextPointerDown,
  rememberTextPointerClick,
  type TextPointerClickMemory,
} from "./text-edit-gesture.js";
import {
  allowsObjectDrag,
  isEditingPlacedBadge,
  isRectCreationTool,
  type EditorTool,
  type RectCreationTool,
} from "../components/annotation-editor/editor-tool.js";

interface UseCanvasInteractionOptions {
  activeTool: EditorTool;
  selectedIds: string[];
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  selectedId: string | null;
  zoom: number;
  figureRef: RefObject<HTMLDivElement | null>;
  wrapRef: RefObject<HTMLDivElement | null>;
  canvasViewportRef: RefObject<HTMLDivElement | null>;
  spaceHeldRef: MutableRefObject<boolean>;
  setIsPanning: Dispatch<SetStateAction<boolean>>;
  setViewportZoom: (nextZoom: number, mode: "fit" | "manual", anchor?: { clientX: number; clientY: number }) => void;
  annotationRef: MutableRefObject<AnnotationFile | null>;
  applyLocalChange: (updater: (current: AnnotationFile) => AnnotationFile) => void;
  visualCropActive: boolean;
  onOpenVisualCrop: (imageId: string) => void;
  onCreatePoint: (type: "badge" | "text" | "cursor", at: PointPct) => void;
  onCreateRect: (type: RectCreationTool, rect: RectPct) => void;
  /** ツール状態(activeTool)は呼び出し側が持つため、線分確定時などのリセットを委譲する */
  onResetActiveTool: () => void;
}

/**
 * キャンバス上のポインタ操作(選択・ドラッグ・リサイズ・マーキー・線分編集・パン)を閉じる。
 * figure はイベント委任で受けるため、常に annotationRef(最新値)から対象を解決する。
 */
export function useCanvasInteraction({
  activeTool,
  selectedIds,
  setSelectedIds,
  selectedId,
  zoom,
  figureRef,
  wrapRef,
  canvasViewportRef,
  spaceHeldRef,
  setIsPanning,
  setViewportZoom,
  annotationRef,
  applyLocalChange,
  visualCropActive,
  onOpenVisualCrop,
  onCreatePoint,
  onCreateRect,
  onResetActiveTool,
}: UseCanvasInteractionOptions) {
  const [hoverPoint, setHoverPoint] = useState<PointPct | null>(null);
  const [rectDraft, setRectDraft] = useState<{ type: RectCreationTool; rect: RectPct } | null>(null);
  const [lineDraft, setLineDraft] = useState<{ type: "line" | "arrow"; points: PointPct[] } | null>(null);
  const [marqueeDraft, setMarqueeDraft] = useState<RectPct | null>(null);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const [interactionObjects, setInteractionObjects] = useState<AnnotationObject[] | null>(null);
  const [selectedPointIndices, setSelectedPointIndices] = useState<number[]>([]);
  const [inlineTextEdit, setInlineTextEdit] = useState<{ id: string; value: string } | null>(null);
  const marqueeJustFinishedRef = useRef(false);
  const lastTextPointerClickRef = useRef<TextPointerClickMemory | null>(null);
  /** 線作成中に Shift 押下/解除だけでプレビューを更新するため、直近のポインタ位置を保持する */
  const lastPointerClientRef = useRef<{ x: number; y: number } | null>(null);
  const selectedPointIndicesRef = useRef(selectedPointIndices);
  selectedPointIndicesRef.current = selectedPointIndices;

  useEffect(() => {
    setSelectedPointIndices([]);
  }, [selectedId]);

  useEffect(() => {
    if (selectedIds.length === 0) {
      setSnapGuides([]);
    }
  }, [selectedIds]);

  const resetDrafts = useCallback(() => {
    setRectDraft(null);
    setLineDraft(null);
    setHoverPoint(null);
  }, []);

  // ポインタ座標 → figure 内の%座標
  const pctFromClient = useCallback((clientX: number, clientY: number): PointPct => {
    const figure = figureRef.current?.querySelector("figure");
    const box = figure?.getBoundingClientRect() ?? wrapRef.current?.getBoundingClientRect();
    if (!box) {
      return { x: 0, y: 0 };
    }
    return {
      x: ((clientX - box.left) / box.width) * 100,
      y: ((clientY - box.top) / box.height) * 100,
    };
  }, [figureRef, wrapRef]);

  const resolveHoverPoint = useCallback((
    clientX: number,
    clientY: number,
    shiftKey: boolean,
  ): PointPct => {
    const point = pctFromClient(clientX, clientY);
    if (
      (activeTool !== "line" && activeTool !== "arrow")
      || !lineDraft
      || lineDraft.points.length === 0
    ) {
      return point;
    }
    return resolveLineDraftPoint(point, lineDraft.points[lineDraft.points.length - 1], {
      shiftKey,
      round: false,
    });
  }, [activeTool, lineDraft, pctFromClient]);

  useEffect(() => {
    if (!lineDraft || lineDraft.points.length === 0) {
      return;
    }
    const refreshHover = (event: KeyboardEvent) => {
      if (event.key !== "Shift") {
        return;
      }
      const last = lastPointerClientRef.current;
      if (!last) {
        return;
      }
      setHoverPoint(resolveHoverPoint(last.x, last.y, event.type === "keydown"));
    };
    window.addEventListener("keydown", refreshHover);
    window.addEventListener("keyup", refreshHover);
    return () => {
      window.removeEventListener("keydown", refreshHover);
      window.removeEventListener("keyup", refreshHover);
    };
  }, [lineDraft, resolveHoverPoint]);

  // ドラッグの共通処理: 3px 未満はクリック(moved=false)として扱う
  const startPointerDrag = useCallback((
    start: { clientX: number; clientY: number },
    handlers: {
      onMove: (pct: PointPct, event: PointerEvent) => void;
      onEnd: (pct: PointPct, moved: boolean, event: PointerEvent) => void;
    },
  ) => {
    const startClient = { x: start.clientX, y: start.clientY };
    let moved = false;
    const onPointerMove = (event: PointerEvent) => {
      if (!moved && Math.hypot(event.clientX - startClient.x, event.clientY - startClient.y) < 3) {
        return;
      }
      moved = true;
      handlers.onMove(pctFromClient(event.clientX, event.clientY), event);
    };
    const onPointerUp = (event: PointerEvent) => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      handlers.onEnd(pctFromClient(event.clientX, event.clientY), moved, event);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }, [pctFromClient]);

  const normalizeDraftRect = useCallback((start: PointPct, end: PointPct): RectPct => ({
    x: roundCreationPct(Math.min(start.x, end.x)),
    y: roundCreationPct(Math.min(start.y, end.y)),
    w: roundCreationPct(Math.abs(end.x - start.x)),
    h: roundCreationPct(Math.abs(end.y - start.y)),
  }), []);

  const getSnapThreshold = useCallback(() => {
    const figure = figureRef.current?.querySelector("figure");
    const box = figure?.getBoundingClientRect();
    if (!box) {
      return SNAP_THRESHOLD_PCT;
    }
    return snapThresholdPct(zoom, box.width, 6);
  }, [figureRef, zoom]);

  const finishLineDraft = useCallback(() => {
    const current = annotationRef.current;
    if (!current || !lineDraft || lineDraft.points.length < 2) {
      return;
    }
    const id = createObjectId(lineDraft.type, current.objects);
    const object: AnnotationObject = lineDraft.type === "arrow"
      ? { id, type: "arrow", source: "manual", arrowHeads: "end", points: lineDraft.points }
      : { id, type: "line", source: "manual", points: lineDraft.points };
    applyLocalChange((latest) => ({ ...latest, objects: [...latest.objects, object] }));
    setSelectedIds([id]);
    onResetActiveTool();
    resetDrafts();
  }, [annotationRef, lineDraft, applyLocalChange, setSelectedIds, onResetActiveTool, resetDrafts]);

  const startMarqueeSelection = useCallback((event: ReactPointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const start = pctFromClient(event.clientX, event.clientY);
    setMarqueeDraft({ x: start.x, y: start.y, w: 0, h: 0 });
    marqueeJustFinishedRef.current = false;
    startPointerDrag(event, {
      onMove: (point) => setMarqueeDraft(normalizeDraftRect(start, point)),
      onEnd: (point, moved, endEvent) => {
        const rect = normalizeDraftRect(start, point);
        setMarqueeDraft(null);
        if (!moved || rect.w < 0.5 || rect.h < 0.5) {
          if (!moved) {
            setSelectedIds([]);
          }
          return;
        }
        marqueeJustFinishedRef.current = true;
        const hits = objectsInRect(annotationRef.current?.objects ?? [], rect);
        const additive = endEvent.metaKey || endEvent.ctrlKey || endEvent.shiftKey;
        setSelectedIds(additive
          ? (current) => {
              const merged = new Set(current);
              for (const id of hits) {
                if (merged.has(id)) {
                  merged.delete(id);
                } else {
                  merged.add(id);
                }
              }
              return [...merged];
            }
          : hits);
      },
    });
  }, [pctFromClient, startPointerDrag, normalizeDraftRect, annotationRef, setSelectedIds]);

  const handleCanvasClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (marqueeJustFinishedRef.current) {
      marqueeJustFinishedRef.current = false;
      return;
    }
    const point = pctFromClient(event.clientX, event.clientY);
    if (activeTool === "badge" || activeTool === "text" || activeTool === "cursor") {
      const targetId = resolveCanvasObjectElement(event)?.dataset.mmId;
      if (isEditingPlacedBadge(activeTool, targetId, selectedIds)) {
        return;
      }
      onCreatePoint(activeTool, point);
      return;
    }
    if (activeTool === "line" || activeTool === "arrow") {
      if (event.detail >= 2) {
        finishLineDraft();
        return;
      }
      // Shift 中は直前の点を基準に 45° 刻みへスナップしてから確定する
      setLineDraft((current) => {
        const continuing = current?.type === activeTool ? current : null;
        const previous = continuing?.points[continuing.points.length - 1];
        const nextPoint = resolveLineDraftPoint(point, previous, { shiftKey: event.shiftKey });
        return continuing
          ? { ...continuing, points: [...continuing.points, nextPoint] }
          : { type: activeTool, points: [nextPoint] };
      });
      return;
    }
    if (activeTool !== "select") {
      return;
    }
    const element = event.target instanceof Element ? event.target : null;
    if (element?.closest(".mm-editor-handle")) {
      return;
    }
    const target = resolveCanvasObjectElement(event);
    if (!target) {
      // 空きキャンバスの選択解除は startMarqueeSelection の !moved に一本化
      return;
    }
    const id = target.dataset.mmId;
    if (!id) {
      return;
    }
    const current = annotationRef.current;
    const obj = current?.objects.find((item) => item.id === id);
    // 編集可能オブジェクトの選択は pointerDown で処理。ロック中のみ click で選択する
    if (!obj || isEditable(obj)) {
      return;
    }
    if (event.metaKey || event.ctrlKey || event.shiftKey) {
      setSelectedIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
    } else {
      setSelectedIds([id]);
    }
  }, [pctFromClient, activeTool, selectedIds, onCreatePoint, finishLineDraft, annotationRef, setSelectedIds]);

  const handleCanvasDoubleClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (activeTool === "line" || activeTool === "arrow") {
      finishLineDraft();
      return;
    }
    if (activeTool !== "select") {
      return;
    }
    const target = resolveCanvasObjectElement(event);
    const id = target?.dataset.mmId;
    const obj = annotationRef.current?.objects.find((item) => item.id === id);
    if (obj?.type === "text" && isEditable(obj)) {
      setSelectedIds([obj.id]);
      setInlineTextEdit({ id: obj.id, value: obj.content });
      return;
    }
    if (obj?.type === "image" && isEditable(obj)) {
      onOpenVisualCrop(obj.id);
    }
  }, [activeTool, finishLineDraft, annotationRef, setSelectedIds, onOpenVisualCrop]);

  const handleCanvasPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    lastPointerClientRef.current = { x: event.clientX, y: event.clientY };
    const targetId = resolveCanvasObjectElement(event)?.dataset.mmId;
    const editingSelectedBadge = isEditingPlacedBadge(activeTool, targetId, selectedIds);
    if (activeTool !== "select" && event.buttons === 0 && !editingSelectedBadge) {
      setHoverPoint(resolveHoverPoint(event.clientX, event.clientY, event.shiftKey));
    }
  }, [activeTool, selectedIds, resolveHoverPoint]);

  const handleCanvasWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    if (!event.metaKey && !event.ctrlKey) {
      return;
    }
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    setViewportZoom(stepZoom(zoom, direction), "manual", event);
  }, [zoom, setViewportZoom]);

  const handleViewportPointerDownCapture = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const viewport = canvasViewportRef.current;
    if (!viewport || !spaceHeldRef.current || event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setIsPanning(true);
    const start = {
      clientX: event.clientX,
      clientY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
    const move = (moveEvent: PointerEvent) => {
      viewport.scrollLeft = start.scrollLeft - (moveEvent.clientX - start.clientX);
      viewport.scrollTop = start.scrollTop - (moveEvent.clientY - start.clientY);
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      setIsPanning(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
  }, [canvasViewportRef, spaceHeldRef, setIsPanning]);

  const handleRectCreationPointerDown = useCallback((event: ReactPointerEvent, type: RectCreationTool) => {
    event.preventDefault();
    event.stopPropagation();
    const start = pctFromClient(event.clientX, event.clientY);
    setRectDraft({ type, rect: { x: start.x, y: start.y, w: 0, h: 0 } });
    startPointerDrag(event, {
      onMove: (point) => setRectDraft({ type, rect: normalizeDraftRect(start, point) }),
      onEnd: (point, moved) => {
        const rect = normalizeDraftRect(start, point);
        setRectDraft(null);
        if (moved && rect.w >= 0.5 && rect.h >= 0.5) {
          onCreateRect(type, rect);
        }
      },
    });
  }, [pctFromClient, startPointerDrag, normalizeDraftRect, onCreateRect]);

  const handleObjectSelectionPointerDown = useCallback((
    event: ReactPointerEvent,
    current: AnnotationFile,
    isSelectMode: boolean,
  ) => {
    const targets = resolveCanvasObjectTargets(event);
    const gesture = classifySelectPointerGesture(targets, {
      isSelectMode,
      isEditableFrame: (id) => {
        const candidate = current.objects.find((item) => item.id === id);
        return !!candidate && isEditable(candidate);
      },
      isSelectedPoint: (id) => selectedIds.includes(id),
    });

    const findEditable = (objectId: string) => {
      const candidate = current.objects.find((item) => item.id === objectId);
      return candidate && isEditable(candidate) ? candidate : null;
    };

    const additive = event.metaKey || event.ctrlKey || event.shiftKey;
    const startPct = pctFromClient(event.clientX, event.clientY);

    const beginTranslatePointerDrag = (
      getSession: () => PreparedObjectDragSession,
      onUnmovedClick?: () => void,
    ) => {
      startPointerDrag(event, {
        onMove: (pct, moveEvent) => {
          const preview = previewTranslateDrag({
            session: getSession(),
            startPct,
            currentPct: pct,
            thresholdPct: getSnapThreshold(),
            altKey: moveEvent.altKey,
          });
          setSnapGuides(preview.activeGuides);
          setInteractionObjects(preview.objects);
        },
        onEnd: (pct, moved, endEvent) => {
          setInteractionObjects(null);
          setSnapGuides([]);
          if (!moved) {
            onUnmovedClick?.();
            return;
          }
          let nextSelectedIds: string[] | undefined;
          applyLocalChange((latest) => {
            const result = commitTranslateDrag({
              session: getSession(),
              startPct,
              currentPct: pct,
              thresholdPct: getSnapThreshold(),
              altKeyAtDown: event.altKey,
              altKeyAtEnd: endEvent.altKey,
              latestObjects: latest.objects,
            });
            nextSelectedIds = result.selectedIds;
            return { ...latest, objects: result.objects };
          });
          if (nextSelectedIds) {
            setSelectedIds(nextSelectedIds);
          }
        },
      });
    };

    switch (gesture.kind) {
      case "none":
        return;
      case "drag": {
        const obj = findEditable(gesture.objectId);
        if (!obj) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();

        // ドラッグ開始時に click イベントが抑止されても、テキストの2回目の
        // pointerdown をダブルクリックとして扱えるようにする。
        if (isSelectMode && obj.type === "text" && !additive) {
          const result = classifyTextPointerDown(
            lastTextPointerClickRef.current,
            obj.id,
            event.timeStamp,
          );
          lastTextPointerClickRef.current = null;
          if (result.openEdit) {
            setSelectedIds([obj.id]);
            setInlineTextEdit({ id: obj.id, value: obj.content });
            return;
          }
        }

        // line / arrow: Option+クリックで最も近い線分に点を挿入(複製ドラッグとは別経路)
        if (isLineObject(obj) && event.altKey) {
          setSelectedIds(nextSelectionIds(selectedIds, gesture.objectId, additive));
          const insertAt = nearestSegmentIndex(obj.points, startPct) + 1;
          applyLocalChange((latest) => ({
            ...latest,
            objects: latest.objects.map((item) =>
              item.id === gesture.objectId && isLineObject(item)
                ? {
                    ...item,
                    points: [
                      ...item.points.slice(0, insertAt),
                      startPct,
                      ...item.points.slice(insertAt),
                    ],
                  }
                : item,
            ),
          }));
          return;
        }

        const session = prepareObjectDragSession({
          objects: current.objects,
          selectedIds,
          objectId: gesture.objectId,
          additive,
          altKey: event.altKey,
        });
        setSelectedIds(session.nextSelectedIds);
        beginTranslatePointerDrag(
          () => session,
          () => {
            if (obj.type === "text" && isSelectMode && !additive) {
              lastTextPointerClickRef.current = rememberTextPointerClick(obj.id, event.timeStamp);
            }
          },
        );
        return;
      }
      case "frame-over-point": {
        if (!findEditable(gesture.frameId)) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();

        let session: PreparedObjectDragSession | null = null;
        beginTranslatePointerDrag(
          () => {
            if (!session) {
              session = prepareObjectDragSession({
                objects: current.objects,
                selectedIds,
                objectId: gesture.frameId,
                additive,
                altKey: event.altKey,
              });
              setSelectedIds(session.nextSelectedIds);
            }
            return session;
          },
          () => {
            setSelectedIds(nextSelectionIds(selectedIds, gesture.pointId, additive));
          },
        );
        return;
      }
      default: {
        const _exhaustive: never = gesture;
        return _exhaustive;
      }
    }
  }, [selectedIds, pctFromClient, startPointerDrag, getSnapThreshold, applyLocalChange, setSelectedIds]);

  const handleFigurePointerDown = useCallback((event: ReactPointerEvent) => {
    const current = annotationRef.current;
    if (!current) {
      return;
    }
    if (visualCropActive) {
      return;
    }
    const eventTarget = event.target instanceof Element ? event.target : null;
    // 整列ツールバーなどキャンバス上の UI はマーキー選択やオブジェクト操作の対象外
    if (eventTarget?.closest("[data-editor-ui]")) {
      return;
    }
    if (isRectCreationTool(activeTool)) {
      handleRectCreationPointerDown(event, activeTool);
      return;
    }
    const targetId = resolveCanvasObjectElement(event)?.getAttribute("data-mm-id") ?? undefined;
    if (activeTool === "select" && !targetId && !eventTarget?.closest(".mm-editor-handle")) {
      startMarqueeSelection(event);
      return;
    }
    if (!allowsObjectDrag(activeTool, targetId, selectedIds)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    handleObjectSelectionPointerDown(event, current, activeTool === "select");
  }, [annotationRef, visualCropActive, activeTool, handleRectCreationPointerDown, selectedIds, startMarqueeSelection, handleObjectSelectionPointerDown]);

  const beginRectResize = useCallback((event: ReactPointerEvent, dir: string) => {
    const current = annotationRef.current;
    if (!current) {
      return;
    }
    const selectedObject = current.objects.find((obj) => obj.id === selectedId);
    if (!selectedObject || !isEditable(selectedObject) || !hasEditableRect(selectedObject)) {
      return;
    }
    const rect0 = editableRect(selectedObject);
    event.preventDefault();
    event.stopPropagation();
    const objectId = selectedObject.id;
    const startPct = pctFromClient(event.clientX, event.clientY);
    const rectFor = (pct: PointPct, shiftKey: boolean): RectPct =>
      resizeRect(rect0, dir, pct.x - startPct.x, pct.y - startPct.y, {
        keepAspectRatio: shiftKey,
      });
    startPointerDrag(event, {
      onMove: (pct, moveEvent) => {
        const next = rectFor(pct, moveEvent.shiftKey);
        setInteractionObjects(current.objects.map((item) =>
          item.id === objectId && isEditable(item) ? withEditableRect(item, next) : item,
        ));
      },
      onEnd: (pct, moved, endEvent) => {
        setInteractionObjects(null);
        if (!moved) {
          return;
        }
        const next = rectFor(pct, endEvent.shiftKey);
        applyLocalChange((latest) => ({
          ...latest,
          objects: latest.objects.map((item) =>
            item.id === objectId && isEditable(item) ? withEditableRect(item, next) : item,
          ),
        }));
      },
    });
  }, [annotationRef, selectedId, pctFromClient, startPointerDrag, applyLocalChange]);

  const beginPointDrag = useCallback((event: ReactPointerEvent, index: number) => {
    const current = annotationRef.current;
    if (!current) {
      return;
    }
    const selectedObject = current.objects.find((obj) => obj.id === selectedId);
    if (!selectedObject || !isEditable(selectedObject) || !isLineObject(selectedObject)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    // Shift/⌘/Ctrl+クリックは加算選択。Shift+ドラッグの角度スナップと両立するため、
    // 既選択点の解除だけは「移動なしクリック」確定時に遅延する
    const additive = event.metaKey || event.ctrlKey || event.shiftKey;
    const resolved = resolvePointPointerDownSelection(
      selectedPointIndicesRef.current,
      index,
      additive,
    );
    setSelectedPointIndices(resolved.immediateSelection);
    const objectId = selectedObject.id;
    const points0 = selectedObject.points;
    const dragIndices = resolved.dragIndices;
    const primary0 = points0[index]!;
    const startPct = pctFromClient(event.clientX, event.clientY);
    const grab = {
      x: primary0.x - startPct.x,
      y: primary0.y - startPct.y,
    };
    const guides = points0.filter((_, i) => !dragIndices.includes(i));
    // 単一点: Shift 中は隣接点基準の 45°、通常時は他点の x/y へ吸着
    // 複数点: 掴んだ点(最後にクリックした点)の開始位置基準で移動方向を 45° 刻みへ。選択点へ同じ移動量を適用
    let snapState: StickySnapState = {};
    const primaryFor = (pointerPct: PointPct, shiftKey: boolean): PointPct => {
      const pct = { x: pointerPct.x + grab.x, y: pointerPct.y + grab.y };
      if (shiftKey) {
        snapState = {};
        return snapDraggedLinePoint(pct, {
          shiftKey: true,
          primaryIndex: index,
          primaryStart: primary0,
          points: points0,
          dragIndices,
        });
      }
      if (dragIndices.length !== 1) {
        return pct;
      }
      const result = stickySnap(pct, guides, snapState, SNAP_THRESHOLD_PCT, SNAP_RELEASE_PCT);
      snapState = result.snapped;
      return result.point;
    };
    const pointsFor = (pointerPct: PointPct, shiftKey: boolean): PointPct[] => {
      const primary = primaryFor(pointerPct, shiftKey);
      const dx = primary.x - primary0.x;
      const dy = primary.y - primary0.y;
      return translateSelectedPoints(points0, dragIndices, dx, dy);
    };
    startPointerDrag(event, {
      onMove: (pct, moveEvent) => {
        const next = pointsFor(pct, moveEvent.shiftKey);
        setInteractionObjects(
          current.objects.map((item) =>
            item.id === objectId && isLineObject(item)
              ? { ...item, points: next }
              : item,
          ),
        );
      },
      onEnd: (pct, moved, endEvent) => {
        setInteractionObjects(null);
        if (!moved) {
          if (resolved.clickSelection) {
            setSelectedPointIndices(resolved.clickSelection);
          }
          return;
        }
        const next = pointsFor(pct, endEvent.shiftKey);
        applyLocalChange((latest) => ({
          ...latest,
          objects: latest.objects.map((item) =>
            item.id === objectId && isLineObject(item)
              ? { ...item, points: next }
              : item,
          ),
        }));
      },
    });
  }, [annotationRef, selectedId, pctFromClient, startPointerDrag, applyLocalChange]);

  return {
    hoverPoint,
    setHoverPoint,
    rectDraft,
    lineDraft,
    marqueeDraft,
    snapGuides,
    interactionObjects,
    selectedPointIndices,
    setSelectedPointIndices,
    inlineTextEdit,
    setInlineTextEdit,
    resetDrafts,
    finishLineDraft,
    handleCanvasClick,
    handleCanvasDoubleClick,
    handleCanvasPointerMove,
    handleCanvasWheel,
    handleViewportPointerDownCapture,
    handleFigurePointerDown,
    beginRectResize,
    beginPointDrag,
  };
}

export type CanvasInteraction = ReturnType<typeof useCanvasInteraction>;
