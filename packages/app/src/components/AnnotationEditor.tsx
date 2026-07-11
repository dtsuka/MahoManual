import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { isEditable, isLineObject, isRectObject, taggableObjectsInDisplayOrder } from "@mahomanual/core/annotation-objects";
import { renderFigure } from "@mahomanual/core/render";
import { expandCanvas } from "@mahomanual/core/expand-canvas";
import {
  annotationThemeCss,
  THEME_FIGURE_CSS,
  type AnnotationTheme,
} from "@mahomanual/core/theme";
import type {
  AnnotationFile,
  AnnotationObject,
} from "@mahomanual/core/schema";
import {
  addAnnotationImage,
  createObjectId,
  injectObjectIds,
  nextBadgeNumber,
  rewriteFigureHtml,
  saveAnnotation,
  replaceAnnotationImage,
  renameAnnotation,
  subscribeProjectWatch,
} from "../lib/api.js";
import { moveItem } from "../lib/collection.js";
import {
  nearestSegmentIndex,
  resizeRect,
  snapAngle,
  stickySnap,
  type RectPct,
  type StickySnapState,
} from "../lib/geometry.js";
import {
  clampCrop,
  duplicateObjects,
  removeUnlockedObjects,
  translateObjects,
} from "../lib/annotation-operations.js";
import {
  IconArrowLeft,
  IconArrowLine,
  IconBadge,
  IconDownload,
  IconFrame,
  IconImage,
  IconLine,
  IconMosaic,
  IconPointer,
  IconRedo,
  IconType,
  IconUndo,
} from "./icons.js";
import {
  Banner,
  Button,
  ButtonLink,
  DirtyBadge,
  IconButton,
  Separator,
  TextInput,
} from "./ui.js";
import { AnnotationObjectList } from "./annotation-editor/AnnotationObjectList.js";
import { AnnotationProperties } from "./annotation-editor/AnnotationProperties.js";
import { CanvasMarginPanel } from "./annotation-editor/CanvasMarginPanel.js";
import { ImageFilePickerModal } from "./annotation-editor/ImageFilePickerModal.js";
import {
  FRAME_HANDLES,
  readImageFile,
} from "./annotation-editor/helpers.js";

// 点ドラッグ時に他の点の x/y へ吸着する距離(%)。
// 解除距離を大きくする(ヒステリシス)ことで吸着⇄解除のフリッカーを防ぐ
const SNAP_THRESHOLD_PCT = 0.7;
const SNAP_RELEASE_PCT = 1.5;
const MAX_HISTORY = 100;

interface AnnotationEditorProps {
  project: string;
  annotationId: string;
  onBack?: () => void;
  onRenamed?: (id: string) => void;
}

type MovableObject = Extract<AnnotationObject, { type: "image" | "badge" | "text" | "cursor" | "frame" | "mosaic" }>;

interface Pt {
  x: number;
  y: number;
}

interface AnnotationPayload {
  annotation: AnnotationFile;
  naturalSizes: Record<string, { w: number; h: number }>;
  theme?: AnnotationTheme;
}

export function AnnotationEditor({ project, annotationId, onBack, onRenamed }: AnnotationEditorProps) {
  const [annotation, setAnnotation] = useState<AnnotationFile | null>(null);
  const [naturalSizes, setNaturalSizes] = useState<Record<string, { w: number; h: number }>>({});
  const [theme, setTheme] = useState<AnnotationTheme>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);
  const [status, setStatus] = useState<string>("");
  const [nextAnnotationId, setNextAnnotationId] = useState(annotationId);
  const [error, setError] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const [, setHistoryVersion] = useState(0);
  const [interactionObjects, setInteractionObjects] = useState<AnnotationObject[] | null>(null);
  const [marginDraft, setMarginDraft] = useState({ top: 0, right: 0, bottom: 0, left: 0 });
  // オブジェクト一覧の D&D 並べ替え(表示 index = 前面から)
  const [dragListIndex, setDragListIndex] = useState<number | null>(null);
  const [dropListIndex, setDropListIndex] = useState<number | null>(null);
  // 未保存編集中に外部(AI/CLI)からの変更を検知したとき、上書きせず退避して確認を挟む
  const [externalPayload, setExternalPayload] = useState<AnnotationPayload | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const figureRef = useRef<HTMLDivElement>(null);
  const annotationRef = useRef<AnnotationFile | null>(null);
  const dirtyRef = useRef(false);
  const savedAnnotationJsonRef = useRef("");
  const historyRef = useRef<{
    past: AnnotationFile[];
    future: AnnotationFile[];
  }>({ past: [], future: [] });
  const copiedIdsRef = useRef<string[]>([]);
  const [imagePickerMode, setImagePickerMode] = useState<"add" | "replace" | null>(null);
  const selectedId = selectedIds.at(-1) ?? null;

  const figureHtml = useMemo(() => {
    if (!annotation) {
      return "";
    }
    const renderedAnnotation = interactionObjects
      ? { ...annotation, objects: interactionObjects }
      : annotation;
    return injectObjectIds(
      rewriteFigureHtml(
        renderFigure(renderedAnnotation, {
          naturalSizes,
          fence: { width: annotation.canvas.width },
        }),
        project,
      ),
      taggableObjectsInDisplayOrder(renderedAnnotation.objects),
    );
  }, [annotation, interactionObjects, naturalSizes, project]);

  const fetchPayload = async (): Promise<AnnotationPayload> => {
    const response = await fetch(
      `/api/projects/${encodeURIComponent(project)}/annotations/${encodeURIComponent(annotationId)}`,
    );
    if (!response.ok) {
      throw new Error("注釈の読み込みに失敗しました");
    }
    return (await response.json()) as AnnotationPayload;
  };

  const applyPayload = (payload: AnnotationPayload) => {
    annotationRef.current = payload.annotation;
    savedAnnotationJsonRef.current = JSON.stringify(payload.annotation);
    historyRef.current = { past: [], future: [] };
    setHistoryVersion((version) => version + 1);
    setAnnotation(payload.annotation);
    setNaturalSizes(payload.naturalSizes);
    setTheme(payload.theme ?? {});
    dirtyRef.current = false;
    setDirty(false);
    setExternalPayload(null);
  };

  // GUI 上の編集はすべてここを通し、annotationRef(最新値)と dirty を同期する
  const applyLocalChange = (updater: (current: AnnotationFile) => AnnotationFile) => {
    const current = annotationRef.current;
    if (!current) {
      return;
    }
    const next = updater(current);
    if (next === current) {
      return;
    }
    historyRef.current = {
      past: [...historyRef.current.past, current].slice(-MAX_HISTORY),
      future: [],
    };
    annotationRef.current = next;
    setAnnotation(next);
    const nextDirty = JSON.stringify(next) !== savedAnnotationJsonRef.current;
    dirtyRef.current = nextDirty;
    setDirty(nextDirty);
    setHistoryVersion((version) => version + 1);
  };

  const restoreHistoryAnnotation = (next: AnnotationFile) => {
    annotationRef.current = next;
    setAnnotation(next);
    setSelectedIds((ids) =>
      ids.filter((id) => next.objects.some((object) => object.id === id)),
    );
    const nextDirty = JSON.stringify(next) !== savedAnnotationJsonRef.current;
    dirtyRef.current = nextDirty;
    setDirty(nextDirty);
    setHistoryVersion((version) => version + 1);
  };

  const undo = () => {
    const current = annotationRef.current;
    const previous = historyRef.current.past.at(-1);
    if (!current || !previous) {
      return;
    }
    historyRef.current = {
      past: historyRef.current.past.slice(0, -1),
      future: [current, ...historyRef.current.future].slice(0, MAX_HISTORY),
    };
    restoreHistoryAnnotation(previous);
  };

  const redo = () => {
    const current = annotationRef.current;
    const next = historyRef.current.future[0];
    if (!current || !next) {
      return;
    }
    historyRef.current = {
      past: [...historyRef.current.past, current].slice(-MAX_HISTORY),
      future: historyRef.current.future.slice(1),
    };
    restoreHistoryAnnotation(next);
  };

  // SPEC §4.5: キャンバス余白。全オブジェクトの%座標を再計算して見た目位置を維持する
  const applyCanvasMargin = () => {
    const { top, right, bottom, left } = marginDraft;
    if (!top && !right && !bottom && !left) {
      return;
    }
    try {
      applyLocalChange((current) => expandCanvas(current, marginDraft));
      setMarginDraft({ top: 0, right: 0, bottom: 0, left: 0 });
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "余白の適用に失敗しました");
    }
  };

  useEffect(() => {
    setNextAnnotationId(annotationId);
    void fetchPayload()
      .then(applyPayload)
      .catch((err: Error) => setError(err.message));
  }, [project, annotationId]);

  useEffect(() => {
    return subscribeProjectWatch(project, (event) => {
      if (event.path !== `annotations/${annotationId}.json`) {
        return;
      }
      void fetchPayload()
        .then((payload) => {
          // 自分の保存によるエコーは無視する
          if (JSON.stringify(payload.annotation) === JSON.stringify(annotationRef.current)) {
            return;
          }
          if (dirtyRef.current) {
            setExternalPayload(payload);
            return;
          }
          applyPayload(payload);
        })
        .catch((err: Error) => setError(err.message));
    });
  }, [project, annotationId]);

  useEffect(() => {
    setSelectedPointIndex(null);
  }, [selectedId]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
        return;
      }
      if (!annotationRef.current) {
        return;
      }
      const commandKey = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (commandKey && key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }
      if (event.ctrlKey && key === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (selectedIds.length === 0) {
        return;
      }
      const selected = new Set(selectedIds);
      if (commandKey && key === "c") {
        event.preventDefault();
        copiedIdsRef.current = [...selectedIds];
        return;
      }
      if (commandKey && key === "v" && copiedIdsRef.current.length > 0) {
        event.preventDefault();
        const result = duplicateObjects(annotationRef.current.objects, copiedIdsRef.current);
        applyLocalChange((current) => ({ ...current, objects: result.objects }));
        setSelectedIds(result.selectedIds);
        copiedIdsRef.current = result.selectedIds;
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        applyLocalChange((current) => ({
          ...current,
          objects: removeUnlockedObjects(current.objects, selected),
        }));
        setSelectedIds((ids) =>
          ids.filter((id) => {
            const obj = annotationRef.current?.objects.find((item) => item.id === id);
            return obj !== undefined && !isEditable(obj);
          }),
        );
        return;
      }
      const directions: Record<string, Pt> = {
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
      };
      const direction = directions[event.key];
      if (direction) {
        event.preventDefault();
        const amount = event.shiftKey ? 1 : 0.1;
        applyLocalChange((current) => ({
          ...current,
          objects: translateObjects(
            current.objects,
            selected,
            direction.x * amount,
            direction.y * amount,
          ),
        }));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedIds]);

  // ポインタ座標 → figure 内の%座標
  const pctFromClient = (clientX: number, clientY: number): Pt => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) {
      return { x: 0, y: 0 };
    }
    return {
      x: ((clientX - box.left) / box.width) * 100,
      y: ((clientY - box.top) / box.height) * 100,
    };
  };

  // ドラッグの共通処理: 3px 未満はクリック(moved=false)として扱う
  const startPointerDrag = (
    start: { clientX: number; clientY: number },
    handlers: {
      onMove: (pct: Pt, event: PointerEvent) => void;
      onEnd: (pct: Pt, moved: boolean, event: PointerEvent) => void;
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
  };

  // figure 上のドラッグはイベント委任で受ける。
  // 要素ごとのリスナー配線は innerHTML 差し替えとのタイミングで外れることが
  // あるため、コンテナ1箇所で受けて常に annotationRef(最新値)から対象を解決する
  const handleFigurePointerDown = (event: ReactPointerEvent) => {
    const target = (event.target as Element).closest("[data-mm-id]");
    const current = annotationRef.current;
    if (!target || !current) {
      return;
    }
    const objectId = target.getAttribute("data-mm-id");
    if (!objectId) {
      return;
    }
    const obj = current.objects.find((item) => item.id === objectId);
    if (!obj || !isEditable(obj)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const wasSelected = selectedIds.includes(objectId);
    const additive = event.metaKey || event.ctrlKey || event.shiftKey;
    const dragIds = wasSelected ? selectedIds : [objectId];
    setSelectedIds(additive
      ? (wasSelected ? selectedIds.filter((id) => id !== objectId) : [...selectedIds, objectId])
      : dragIds);
    const startPct = pctFromClient(event.clientX, event.clientY);

    if (obj.type === "badge" || obj.type === "text" || obj.type === "cursor") {
      // 掴んだ点と中心のズレを保持(クリックだけで中心が吸い付かないように)
      const grab = { x: obj.at.x - startPct.x, y: obj.at.y - startPct.y };
      startPointerDrag(event, {
        onMove: (pct) => {
          const dx = pct.x + grab.x - obj.at.x;
          const dy = pct.y + grab.y - obj.at.y;
          setInteractionObjects(translateObjects(current.objects, new Set(dragIds), dx, dy));
        },
        onEnd: (pct, moved) => {
          setInteractionObjects(null);
          if (!moved) {
            return;
          }
          const at = { x: pct.x + grab.x, y: pct.y + grab.y };
          const dx = at.x - obj.at.x;
          const dy = at.y - obj.at.y;
          applyLocalChange((latest) => ({
            ...latest,
            objects: translateObjects(latest.objects, new Set(dragIds), dx, dy),
          }));
        },
      });
      return;
    }

    if (isRectObject(obj)) {
      const rect0 = obj.rect;
      const grab = { x: rect0.x - startPct.x, y: rect0.y - startPct.y };
      const rectFor = (pct: Pt): RectPct => ({ ...rect0, x: pct.x + grab.x, y: pct.y + grab.y });
      startPointerDrag(event, {
        onMove: (pct) => {
          const next = rectFor(pct);
          setInteractionObjects(translateObjects(
            current.objects,
            new Set(dragIds),
            next.x - rect0.x,
            next.y - rect0.y,
          ));
        },
        onEnd: (pct, moved) => {
          setInteractionObjects(null);
          if (!moved) {
            return;
          }
          const next = rectFor(pct);
          const dx = next.x - rect0.x;
          const dy = next.y - rect0.y;
          applyLocalChange((latest) => ({
            ...latest,
            objects: translateObjects(latest.objects, new Set(dragIds), dx, dy),
          }));
        },
      });
      return;
    }

    // line / arrow: Option+クリックで最も近い線分に点を挿入
    if (event.altKey) {
      const insertAt = nearestSegmentIndex(obj.points, startPct) + 1;
      applyLocalChange((latest) => ({
        ...latest,
        objects: latest.objects.map((item) =>
          item.id === objectId && isLineObject(item)
            ? {
                ...item,
                points: [...item.points.slice(0, insertAt), startPct, ...item.points.slice(insertAt)],
              }
            : item,
        ),
      }));
      return;
    }

    // line / arrow: 全点を平行移動
    const points0 = obj.points;
    const pointsFor = (pct: Pt): Pt[] =>
      points0.map((point) => ({
        x: point.x + pct.x - startPct.x,
        y: point.y + pct.y - startPct.y,
      }));
    startPointerDrag(event, {
      onMove: (pct) => {
        setInteractionObjects(translateObjects(
          current.objects,
          new Set(dragIds),
          pct.x - startPct.x,
          pct.y - startPct.y,
        ));
      },
      onEnd: (pct, moved) => {
        setInteractionObjects(null);
        if (!moved) {
          return;
        }
        const dx = pct.x - startPct.x;
        const dy = pct.y - startPct.y;
        applyLocalChange((latest) => ({
          ...latest,
          objects: translateObjects(latest.objects, new Set(dragIds), dx, dy),
        }));
      },
    });
  };

  useEffect(() => {
    if (!figureRef.current) {
      return;
    }
    const nodes = figureRef.current.querySelectorAll("[data-mm-id]");
    nodes.forEach((node) => node.classList.remove("is-selected"));
    for (const id of selectedIds) {
      figureRef.current.querySelectorAll(`[data-mm-id="${id}"]`).forEach((node) => {
        node.classList.add("is-selected");
      });
    }
  }, [selectedIds, figureHtml]);

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center px-6">
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }
  if (!annotation) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-slate-500">
        読み込み中…
      </div>
    );
  }

  const selected = annotation.objects.find((obj) => obj.id === selectedId) ?? null;

  const updateObject = (objectId: string, updater: (obj: AnnotationObject) => AnnotationObject) => {
    applyLocalChange((current) => ({
      ...current,
      objects: current.objects.map((obj) => (obj.id === objectId && isEditable(obj) ? updater(obj) : obj)),
    }));
  };

  const toggleObjectLock = (objectId: string) => {
    applyLocalChange((current) => ({
      ...current,
      objects: current.objects.map((obj) =>
        obj.id === objectId ? { ...obj, locked: !obj.locked } : obj,
      ),
    }));
  };

  const addObject = (type: Exclude<MovableObject["type"], "image" | "mosaic">) => {
    const id = createObjectId(type, annotation.objects);
    let newObject: AnnotationObject;
    switch (type) {
      case "badge":
        newObject = {
          id,
          type: "badge",
          source: "manual",
          n: nextBadgeNumber(annotation.objects),
          at: { x: 50, y: 50 },
        };
        break;
      case "text":
        newObject = {
          id,
          type: "text",
          source: "manual",
          content: "テキスト",
          at: { x: 50, y: 50 },
        };
        break;
      case "cursor":
        newObject = {
          id,
          type: "cursor",
          source: "manual",
          icon: "pointer",
          at: { x: 50, y: 50 },
          size: 28,
        };
        break;
      case "frame":
        newObject = {
          id,
          type: "frame",
          source: "manual",
          rect: { x: 40, y: 40, w: 20, h: 10 },
        };
        break;
      default: {
        const _exhaustive: never = type;
        return _exhaustive;
      }
    }
    applyLocalChange((current) => ({ ...current, objects: [...current.objects, newObject] }));
    setSelectedIds([id]);
  };

  const addMosaic = () => {
    const selectedImage = selected?.type === "image" ? selected : null;
    const target = selectedImage ?? [...annotation.objects].reverse().find(
      (obj): obj is Extract<AnnotationObject, { type: "image" }> => obj.type === "image",
    );
    if (!target) {
      setError("モザイク対象の画像がありません");
      return;
    }
    const id = createObjectId("mosaic", annotation.objects);
    const mosaic: AnnotationObject = {
      id,
      type: "mosaic",
      source: "manual",
      targetImageId: target.id,
      rect: { x: 20, y: 70, w: 25, h: 15 },
      blockSize: 12,
    };
    applyLocalChange((current) => ({ ...current, objects: [...current.objects, mosaic] }));
    setSelectedIds([id]);
  };

  const addLine = (type: "line" | "arrow") => {
    const id = createObjectId(type, annotation.objects);
    const points = [
      { x: 20, y: 80 },
      { x: 50, y: 80 },
      { x: 50, y: 20 },
    ];
    const newObject: AnnotationObject = type === "arrow"
      ? { id, type, source: "manual", arrowHeads: "end", points }
      : { id, type, source: "manual", points };
    applyLocalChange((current) => ({ ...current, objects: [...current.objects, newObject] }));
    setSelectedIds([id]);
  };

  const beginRectResize = (event: ReactPointerEvent, dir: string) => {
    const current = annotationRef.current;
    if (!current) {
      return;
    }
    const selectedObject = current.objects.find((obj) => obj.id === selectedId);
    if (!selectedObject || !isEditable(selectedObject) || !isRectObject(selectedObject)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const objectId = selectedObject.id;
    const rect0 = selectedObject.rect;
    const startPct = pctFromClient(event.clientX, event.clientY);
    const rectFor = (pct: Pt): RectPct => resizeRect(rect0, dir, pct.x - startPct.x, pct.y - startPct.y);
    startPointerDrag(event, {
      onMove: (pct) => {
        const next = rectFor(pct);
        setInteractionObjects(current.objects.map((item) =>
          item.id === objectId && isEditable(item) && isRectObject(item)
            ? { ...item, rect: next }
            : item,
        ));
      },
      onEnd: (pct, moved) => {
        setInteractionObjects(null);
        if (!moved) {
          return;
        }
        const next = rectFor(pct);
        applyLocalChange((latest) => ({
          ...latest,
          objects: latest.objects.map((item) =>
            item.id === objectId && isEditable(item) && isRectObject(item)
              ? { ...item, rect: next }
              : item,
          ),
        }));
      },
    });
  };

  const beginPointDrag = (event: ReactPointerEvent, index: number) => {
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
    setSelectedPointIndex(index);
    const objectId = selectedObject.id;
    const points0 = selectedObject.points;
    const startPct = pctFromClient(event.clientX, event.clientY);
    const grab = {
      x: points0[index]!.x - startPct.x,
      y: points0[index]!.y - startPct.y,
    };
    const guides = points0.filter((_, i) => i !== index);
    // Shift 中は隣接点を基準に 45° 刻み、通常時は他の点の x/y へ吸着
    // (水平・垂直の線を揃えやすくする)。吸着はヒステリシス付き
    let snapState: StickySnapState = {};
    const snap = (pointerPct: Pt, shiftKey: boolean): Pt => {
      const pct = { x: pointerPct.x + grab.x, y: pointerPct.y + grab.y };
      if (shiftKey) {
        snapState = {};
        const anchor = points0[index - 1] ?? points0[index + 1];
        return anchor ? snapAngle(pct, anchor) : pct;
      }
      const result = stickySnap(pct, guides, snapState, SNAP_THRESHOLD_PCT, SNAP_RELEASE_PCT);
      snapState = result.snapped;
      return result.point;
    };
    const pointsFor = (pct: Pt): Pt[] => points0.map((point, i) => (i === index ? pct : point));
    startPointerDrag(event, {
      onMove: (pct, moveEvent) => {
        const next = pointsFor(snap(pct, moveEvent.shiftKey));
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
          return;
        }
        const next = pointsFor(snap(pct, endEvent.shiftKey));
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
  };

  const addPoint = () => {
    if (!selected || !isLineObject(selected)) {
      return;
    }
    const objectId = selected.id;
    setSelectedPointIndex(selected.points.length);
    updateObject(objectId, (obj) => {
      if (!isLineObject(obj)) {
        return obj;
      }
      const last = obj.points[obj.points.length - 1] ?? { x: 50, y: 50 };
      return { ...obj, points: [...obj.points, { x: Math.min(last.x + 8, 100), y: last.y }] };
    });
  };

  const removePoint = (index: number) => {
    if (!selected || !isLineObject(selected)) {
      return;
    }
    updateObject(selected.id, (obj) => {
      if (!isLineObject(obj) || obj.points.length <= 2) {
        return obj;
      }
      return { ...obj, points: obj.points.filter((_, i) => i !== index) };
    });
    setSelectedPointIndex((current) => {
      if (current === null) {
        return null;
      }
      if (current === index) {
        return null;
      }
      return current > index ? current - 1 : current;
    });
  };

  // サイドパネルの数値・スタイル入力(選択中オブジェクトの型に応じて使用)
  const updateAt = (axis: "x" | "y", value: number) => {
    if (
      !selected ||
      (selected.type !== "badge" && selected.type !== "text" && selected.type !== "cursor")
    ) {
      return;
    }
    updateObject(selected.id, (obj) =>
      obj.type === "badge" || obj.type === "text" || obj.type === "cursor"
        ? { ...obj, at: { ...obj.at, [axis]: value } }
        : obj,
    );
  };

  const updateRect = (key: "x" | "y" | "w" | "h", value: number) => {
    if (!selected || !isRectObject(selected)) {
      return;
    }
    const clamped = key === "w" || key === "h" ? Math.max(0.5, value) : value;
    updateObject(selected.id, (obj) =>
      isRectObject(obj) ? { ...obj, rect: { ...obj.rect, [key]: clamped } } : obj,
    );
  };

  const updateCrop = (key: "x" | "y" | "w" | "h", value: number) => {
    if (!selected || selected.type !== "image") {
      return;
    }
    const natural = naturalSizes[selected.src];
    if (!natural) {
      return;
    }
    const current = selected.crop ?? { x: 0, y: 0, w: natural.w, h: natural.h };
    const next = clampCrop({ ...current, [key]: value }, natural);
    updateObject(selected.id, (obj) => obj.type === "image" ? { ...obj, crop: next } : obj);
  };

  const updatePointValue = (index: number, axis: "x" | "y", value: number) => {
    if (!selected || !isLineObject(selected)) {
      return;
    }
    updateObject(selected.id, (obj) =>
      isLineObject(obj)
        ? {
            ...obj,
            points: obj.points.map((point, i) => (i === index ? { ...point, [axis]: value } : point)),
          }
        : obj,
    );
  };

  const updateLineStyle = (patch: { color?: string; strokeWidth?: number }) => {
    if (!selected || !isLineObject(selected)) {
      return;
    }
    updateObject(selected.id, (obj) => (isLineObject(obj) ? { ...obj, ...patch } : obj));
  };

  const updateLineType = (type: "line" | "arrow") => {
    if (!selected || !isLineObject(selected)) {
      return;
    }
    updateObject(selected.id, (obj) => {
      if (!isLineObject(obj)) {
        return obj;
      }
      if (type === "arrow") {
        return {
          ...obj,
          type: "arrow",
          arrowHeads: obj.type === "arrow" ? (obj.arrowHeads ?? "end") : "end",
        };
      }
      if (obj.type === "arrow") {
        const { arrowHeads: _arrowHeads, ...line } = obj;
        return { ...line, type: "line" };
      }
      return obj;
    });
  };

  const updateArrowHeads = (arrowHeads: "start" | "end" | "both") => {
    if (!selected || selected.type !== "arrow") {
      return;
    }
    updateObject(selected.id, (obj) =>
      obj.type === "arrow" ? { ...obj, arrowHeads } : obj,
    );
  };

  const handleSave = async () => {
    try {
      const saved = await saveAnnotation(project, annotationId, annotationRef.current ?? annotation);
      // サーバーで zod 正規化された内容を保持し、保存エコーの同一判定を確実にする
      annotationRef.current = saved.annotation;
      savedAnnotationJsonRef.current = JSON.stringify(saved.annotation);
      setAnnotation(saved.annotation);
      dirtyRef.current = false;
      setDirty(false);
      setStatus("保存しました");
      setTimeout(() => setStatus(""), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    }
  };

  const handleReplaceImage = async (file: File) => {
    if (!selected || !isEditable(selected) || selected.type !== "image") {
      return;
    }
    try {
      const replacement = await readImageFile(file);
      const payload = await replaceAnnotationImage(
        project,
        annotationId,
        selected.id,
        replacement.data,
        replacement.width,
        replacement.height,
      );
      applyPayload({ ...payload, theme });
      setSelectedIds([selected.id]);
      setStatus("画像を置換しました");
      setTimeout(() => setStatus(""), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "画像の置換に失敗しました");
    }
  };

  const handleAddImage = async (file: File) => {
    try {
      const image = await readImageFile(file);
      const objectId = createObjectId("image", annotationRef.current?.objects ?? annotation.objects);
      const payload = await addAnnotationImage(
        project,
        annotationId,
        objectId,
        image.data,
        image.width,
        image.height,
      );
      applyPayload({ ...payload, theme });
      setSelectedIds([objectId]);
      setStatus("画像を追加しました");
      setTimeout(() => setStatus(""), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "画像の追加に失敗しました");
    }
  };

  const handleRename = async () => {
    const nextId = nextAnnotationId.trim();
    if (!nextId || nextId === annotationId || dirty) {
      return;
    }
    try {
      const result = await renameAnnotation(project, annotationId, nextId);
      annotationRef.current = result.annotation;
      setStatus("画像IDを変更しました");
      onRenamed?.(result.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "画像IDの変更に失敗しました");
    }
  };

  // 一覧は前面→背面(配列の逆順)で表示するため、表示 index を実配列に変換して並べ替える
  const reorderByDisplayIndex = (from: number, to: number) => {
    if (from === to) {
      return;
    }
    applyLocalChange((current) => {
      const currentDisplay = [...current.objects].reverse();
      if (currentDisplay[from] && !isEditable(currentDisplay[from]!)) {
        return current;
      }
      const displayed = moveItem(currentDisplay, from, to);
      return { ...current, objects: displayed.reverse() };
    });
  };

  const interactionSelected = interactionObjects?.find((obj) => obj.id === selectedId) ?? selected;
  const activeFrameRect = interactionSelected && isEditable(interactionSelected) && isRectObject(interactionSelected)
    ? interactionSelected.rect
    : null;
  const activeLinePoints =
    interactionSelected && isEditable(interactionSelected) && isLineObject(interactionSelected)
      ? interactionSelected.points
      : null;

  const lineObjects = (interactionObjects ?? annotation.objects).filter(isLineObject);
  const toCanvasPoints = (points: Pt[]): string =>
    points
      .map(
        (point) =>
          `${(point.x / 100) * annotation.canvas.width},${(point.y / 100) * annotation.canvas.height}`,
      )
      .join(" ");

  return (
    <div className="flex h-screen min-h-0 flex-col" data-testid="annotation-editor">
      <style>{THEME_FIGURE_CSS}</style>
      {annotationThemeCss(theme) ? <style>{annotationThemeCss(theme)}</style> : null}
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
        {onBack ? (
          <IconButton label="戻る" onClick={onBack}>
            <IconArrowLeft />
          </IconButton>
        ) : null}
        <h1 className="min-w-0 truncate text-[15px] font-semibold tracking-tight">
          {project} / {annotationId}
        </h1>
        <div className="flex items-center gap-1">
          <TextInput
            data-testid="rename-id-input"
            uiSize="sm"
            className="w-40 font-mono"
            value={nextAnnotationId}
            aria-label="画像ID"
            onChange={(event) => setNextAnnotationId(event.target.value)}
          />
          <Button
            size="sm"
            data-testid="rename-id-button"
            disabled={dirty || !nextAnnotationId.trim() || nextAnnotationId.trim() === annotationId}
            title={dirty ? "先に変更を保存してください" : "画像IDを変更"}
            onClick={() => void handleRename()}
          >
            ID変更
          </Button>
        </div>
        {dirty ? <DirtyBadge /> : null}
        <div className="ml-auto flex items-center gap-1.5">
          <IconButton
            label="元に戻す (⌘Z)"
            data-testid="undo-button"
            disabled={historyRef.current.past.length === 0}
            onClick={undo}
          >
            <IconUndo />
          </IconButton>
          <IconButton
            label="やり直す (⌘⇧Z)"
            data-testid="redo-button"
            disabled={historyRef.current.future.length === 0}
            onClick={redo}
          >
            <IconRedo />
          </IconButton>
          <Separator />
          <ButtonLink
            size="sm"
            href={`/api/projects/${encodeURIComponent(project)}/annotations/${encodeURIComponent(annotationId)}/image.png`}
            download={`${annotationId}.png`}
            data-testid="download-composed-image"
            aria-disabled={dirty}
            title={dirty ? "先に変更を保存してください" : "画像と注釈を合成したPNGをダウンロード"}
            className={dirty ? "pointer-events-none opacity-40" : ""}
            onClick={(event) => {
              if (dirty) {
                event.preventDefault();
              }
            }}
          >
            <IconDownload size={14} />
            PNG出力
          </ButtonLink>
          <Button
            size="sm"
            variant="primary"
            className="px-4"
            data-testid="save-button"
            onClick={() => void handleSave()}
          >
            保存
          </Button>
        </div>
      </header>
      {status ? <Banner kind="success">{status}</Banner> : null}
      {externalPayload ? (
        <Banner kind="warning" testId="external-change-banner">
          <span className="min-w-0 flex-1">
            外部で注釈が変更されました。読み込むと未保存の編集は失われます。
          </span>
          <Button size="sm" data-testid="apply-external" onClick={() => applyPayload(externalPayload)}>
            外部の内容を読み込む
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setExternalPayload(null)}>
            無視する
          </Button>
        </Banner>
      ) : null}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* オブジェクト追加ツールレール(キャンバス左端にフロート)。
            ツール名は SPEC の注釈用語に合わせ、CSS ツールチップで表示する */}
        <div className="absolute left-3 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-md">
          <IconButton label="丸数字" tip data-testid="add-badge" onClick={() => addObject("badge")}>
            <IconBadge />
          </IconButton>
          <IconButton label="テキスト" tip onClick={() => addObject("text")}>
            <IconType />
          </IconButton>
          <IconButton label="カーソル" tip data-testid="add-cursor" onClick={() => addObject("cursor")}>
            <IconPointer />
          </IconButton>
          <IconButton label="強調枠" tip onClick={() => addObject("frame")}>
            <IconFrame />
          </IconButton>
          <IconButton label="罫線" tip onClick={() => addLine("line")}>
            <IconLine />
          </IconButton>
          <IconButton label="矢印" tip onClick={() => addLine("arrow")}>
            <IconArrowLine />
          </IconButton>
          <IconButton label="画像" tip data-testid="add-image" onClick={() => setImagePickerMode("add")}>
            <IconImage />
          </IconButton>
          <IconButton label="モザイク" tip data-testid="add-mosaic" onClick={addMosaic}>
            <IconMosaic />
          </IconButton>
        </div>
        <div className="editor-canvas relative flex-1 overflow-auto p-8 pl-16">
          <div
            ref={wrapRef}
            className="relative mx-auto bg-white shadow-md ring-1 ring-slate-900/10"
            style={{ maxWidth: annotation.canvas.width }}
            onPointerDown={handleFigurePointerDown}
            onClick={(event) => {
              const element = event.target as HTMLElement;
              if (element.closest(".mm-editor-handle")) {
                return;
              }
              const target = element.closest<HTMLElement>("[data-mm-id]");
              if (!target) {
                setSelectedIds([]);
                return;
              }
              const id = target.dataset.mmId;
              if (!id) {
                return;
              }
              const obj = annotation.objects.find((item) => item.id === id);
              // 編集可能オブジェクトの選択は pointerDown で処理。ロック中のみ click で選択する
              if (!obj || isEditable(obj)) {
                return;
              }
              if (event.metaKey || event.ctrlKey || event.shiftKey) {
                setSelectedIds((current) =>
                  current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
                );
              } else {
                setSelectedIds([id]);
              }
            }}
          >
            <div
              ref={figureRef}
              className="mm-editor-figure"
              dangerouslySetInnerHTML={{ __html: figureHtml }}
            />
            {/* 編集ハンドル・ヒット領域は figure と同じ%座標系のオーバーレイに描く */}
            <div className="pointer-events-none absolute inset-0">
              <svg
                className="mm-editor-hit-layer"
                viewBox={`0 0 ${annotation.canvas.width} ${annotation.canvas.height}`}
                preserveAspectRatio="none"
              >
                {lineObjects.map((obj) => (
                  <polyline
                    key={obj.id}
                    data-mm-id={obj.id}
                    points={toCanvasPoints(obj.points)}
                  />
                ))}
              </svg>
              {activeFrameRect
                ? FRAME_HANDLES.map((handle) => (
                    <div
                      key={handle.dir}
                      data-testid={`frame-handle-${handle.dir}`}
                      className="mm-editor-handle"
                      style={{
                        left: `${activeFrameRect.x + activeFrameRect.w * handle.fx}%`,
                        top: `${activeFrameRect.y + activeFrameRect.h * handle.fy}%`,
                        cursor: handle.cursor,
                      }}
                      onPointerDown={(event) => beginRectResize(event, handle.dir)}
                    />
                  ))
                : null}
              {activeLinePoints
                ? activeLinePoints.map((point, index) => (
                    <div
                      key={index}
                      data-testid={`point-handle-${index}`}
                      className={`mm-editor-handle mm-editor-handle--point ${
                        selectedPointIndex === index ? "is-active" : ""
                      }`}
                      style={{ left: `${point.x}%`, top: `${point.y}%`, cursor: "move" }}
                      onPointerDown={(event) => beginPointDrag(event, index)}
                    />
                  ))
                : null}
            </div>
          </div>
        </div>
        <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-slate-200 bg-white">
          <AnnotationObjectList
            objects={annotation.objects}
            selectedIds={selectedIds}
            dragListIndex={dragListIndex}
            dropListIndex={dropListIndex}
            onSelect={(id, additive) => {
              if (additive) {
                setSelectedIds((current) =>
                  current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
                );
              } else {
                setSelectedIds([id]);
              }
            }}
            onToggleLock={toggleObjectLock}
            onReorder={reorderByDisplayIndex}
            onDragListIndexChange={setDragListIndex}
            onDropListIndexChange={setDropListIndex}
          />
          <CanvasMarginPanel
            marginDraft={marginDraft}
            onChange={setMarginDraft}
            onApply={applyCanvasMargin}
          />
          <AnnotationProperties
            selected={selected}
            annotation={annotation}
            naturalSizes={naturalSizes}
            theme={theme}
            selectedPointIndex={selectedPointIndex}
            setSelectedPointIndex={setSelectedPointIndex}
            updateObject={updateObject}
            updateAt={updateAt}
            updateRect={updateRect}
            updateCrop={updateCrop}
            updateLineType={updateLineType}
            updateLineStyle={updateLineStyle}
            updateArrowHeads={updateArrowHeads}
            updatePointValue={updatePointValue}
            addPoint={addPoint}
            removePoint={removePoint}
            onOpenReplaceImage={() => setImagePickerMode("replace")}
          />
        </aside>
      </div>
      <ImageFilePickerModal
        open={imagePickerMode !== null}
        title={imagePickerMode === "replace" ? "画像ファイルを置換" : "画像を追加"}
        description={
          imagePickerMode === "replace"
            ? "選択中の画像オブジェクトのファイルだけを差し替えます。注釈は保持されます。"
            : "キャンバスに新しい画像オブジェクトを追加します。"
        }
        modalTestId={imagePickerMode === "replace" ? "replace-image-modal" : "add-image-modal"}
        fileInputTestId={imagePickerMode === "replace" ? "replace-image-input" : "add-image-input"}
        onClose={() => setImagePickerMode(null)}
        onSelect={(file) => {
          if (imagePickerMode === "replace") {
            void handleReplaceImage(file);
          } else {
            void handleAddImage(file);
          }
        }}
      />
    </div>
  );
}
