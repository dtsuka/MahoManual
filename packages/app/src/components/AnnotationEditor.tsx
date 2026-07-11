import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { renderFigure } from "@mahomanual/core/render";
import { expandCanvas } from "@mahomanual/core/expand-canvas";
import {
  annotationThemeCss,
  DEFAULT_ANNOTATION_COLOR,
  DEFAULT_ANNOTATION_FONT_SIZE,
  DEFAULT_CURSOR_COLOR,
  THEME_FIGURE_CSS,
  type AnnotationTheme,
} from "@mahomanual/core/theme";
import type {
  AnnotationFile,
  AnnotationObject,
  CursorIcon,
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
  IconGrip,
  IconImage,
  IconLine,
  IconLock,
  IconMosaic,
  IconPlus,
  IconPointer,
  IconRedo,
  IconType,
  IconUndo,
  IconUnlock,
  IconX,
} from "./icons.js";
import {
  Banner,
  Button,
  ButtonLink,
  ColorInput,
  DirtyBadge,
  IconButton,
  Kbd,
  SelectInput,
  Separator,
  TextInput,
  cx,
} from "./ui.js";

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

function readImageFile(file: File): Promise<{ data: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
    reader.onload = () => {
      const data = reader.result as string;
      const image = new Image();
      image.onerror = () => reject(new Error("画像サイズを取得できません"));
      image.onload = () => resolve({
        data,
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
      image.src = data;
    };
    reader.readAsDataURL(file);
  });
}

// ドラッグ中の一時形状。figure DOM はドラッグ中 style を直接更新し、
// state へのコミット(applyLocalChange)は pointerup 時にのみ行う
interface DraftShape {
  rect?: RectPct;
}

const FRAME_HANDLES = [
  { dir: "nw", fx: 0, fy: 0, cursor: "nwse-resize" },
  { dir: "n", fx: 0.5, fy: 0, cursor: "ns-resize" },
  { dir: "ne", fx: 1, fy: 0, cursor: "nesw-resize" },
  { dir: "e", fx: 1, fy: 0.5, cursor: "ew-resize" },
  { dir: "se", fx: 1, fy: 1, cursor: "nwse-resize" },
  { dir: "s", fx: 0.5, fy: 1, cursor: "ns-resize" },
  { dir: "sw", fx: 0, fy: 1, cursor: "nesw-resize" },
  { dir: "w", fx: 0, fy: 0.5, cursor: "ew-resize" },
] as const;

function NumberField({
  label,
  value,
  onChange,
  testId,
  step = 0.1,
  min,
  onFocus,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  testId?: string;
  step?: number;
  min?: number;
  onFocus?: () => void;
}) {
  return (
    <label className="flex h-7 min-w-0 flex-1 items-center gap-1 rounded-md border border-slate-300 bg-white px-1.5 shadow-xs transition-colors duration-150 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500/20">
      {label ? (
        <span className="w-3 shrink-0 text-[11px] font-medium text-slate-500">{label}</span>
      ) : null}
      <input
        type="number"
        step={step}
        min={min}
        data-testid={testId}
        className="h-full w-full min-w-0 bg-transparent text-[13px] text-slate-900 outline-none"
        value={Math.round(value * 100) / 100}
        onFocus={onFocus}
        onChange={(event) => {
          const next = Number.parseFloat(event.target.value);
          if (!Number.isNaN(next)) {
            onChange(next);
          }
        }}
      />
    </label>
  );
}

function objectLabel(obj: AnnotationObject): string {
  switch (obj.type) {
    case "badge":
      return `badge ${obj.n}`;
    case "text":
      return `text 「${obj.content.slice(0, 8)}${obj.content.length > 8 ? "…" : ""}」`;
    case "cursor":
      return `cursor ${obj.icon}`;
    case "image":
      return `image ${obj.src.split("/").pop() ?? obj.src}`;
    case "frame":
      return "frame";
    case "mosaic":
      return `mosaic → ${obj.targetImageId}`;
    case "line":
      return "line";
    case "arrow":
      return "arrow";
  }
}

// オブジェクト一覧・プロパティ見出しで使う種別アイコン
function objectIcon(type: AnnotationObject["type"], size = 14) {
  switch (type) {
    case "badge":
      return <IconBadge size={size} />;
    case "text":
      return <IconType size={size} />;
    case "cursor":
      return <IconPointer size={size} />;
    case "image":
      return <IconImage size={size} />;
    case "frame":
      return <IconFrame size={size} />;
    case "mosaic":
      return <IconMosaic size={size} />;
    case "line":
      return <IconLine size={size} />;
    case "arrow":
      return <IconArrowLine size={size} />;
  }
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
  const [draft, setDraft] = useState<DraftShape | null>(null);
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
  const addImageInputRef = useRef<HTMLInputElement>(null);
  const replaceImageInputRef = useRef<HTMLInputElement>(null);
  const selectedId = selectedIds.at(-1) ?? null;

  const figureHtml = useMemo(() => {
    if (!annotation) {
      return "";
    }
    const taggable = annotation.objects.filter(
      (obj): obj is MovableObject =>
        obj.type === "image" || obj.type === "badge" || obj.type === "text" || obj.type === "cursor" || obj.type === "frame" || obj.type === "mosaic",
    );
    return injectObjectIds(
      rewriteFigureHtml(
        renderFigure(annotation, { naturalSizes, fence: { width: annotation.canvas.width } }),
        project,
      ),
      taggable,
    );
  }, [annotation, naturalSizes, project]);

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
    setDraft(null);
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
        setSelectedIds((ids) => ids.filter((id) => annotationRef.current?.objects.find((obj) => obj.id === id)?.locked));
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

  // 本体と透明ヒットエリアの両方の polyline を同時に更新する
  const setPolylinePoints = (objectId: string, points: Pt[]) => {
    const canvas = annotationRef.current?.canvas;
    const root = figureRef.current;
    if (!canvas || !root) {
      return;
    }
    const value = points
      .map((point) => `${(point.x / 100) * canvas.width},${(point.y / 100) * canvas.height}`)
      .join(" ");
    root
      .querySelectorAll(`polyline[data-mm-id="${objectId}"]`)
      .forEach((element) => element.setAttribute("points", value));
  };

  const setPointHandlePositions = (points: Pt[]) => {
    const root = wrapRef.current;
    if (!root) {
      return;
    }
    root.querySelectorAll<HTMLElement>('[data-testid^="point-handle-"]').forEach((handle, index) => {
      const point = points[index];
      if (point) {
        handle.style.left = `${point.x}%`;
        handle.style.top = `${point.y}%`;
      }
    });
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
    if (!obj || obj.locked) {
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
      const el = target as HTMLElement;
      startPointerDrag(event, {
        onMove: (pct) => {
          el.style.left = `${pct.x + grab.x}%`;
          el.style.top = `${pct.y + grab.y}%`;
        },
        onEnd: (pct, moved) => {
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

    if (obj.type === "frame" || obj.type === "image" || obj.type === "mosaic") {
      const rect0 = obj.rect;
      const grab = { x: rect0.x - startPct.x, y: rect0.y - startPct.y };
      const el = target as HTMLElement;
      const rectFor = (pct: Pt): RectPct => ({ ...rect0, x: pct.x + grab.x, y: pct.y + grab.y });
      startPointerDrag(event, {
        onMove: (pct) => {
          const next = rectFor(pct);
          el.style.left = `${next.x}%`;
          el.style.top = `${next.y}%`;
          setDraft({ rect: next });
        },
        onEnd: (pct, moved) => {
          setDraft(null);
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
          item.id === objectId && (item.type === "line" || item.type === "arrow")
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
        const next = pointsFor(pct);
        setPolylinePoints(objectId, next);
        setPointHandlePositions(next);
      },
      onEnd: (pct, moved) => {
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
      objects: current.objects.map((obj) => (obj.id === objectId && !obj.locked ? updater(obj) : obj)),
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
    const target = [...annotation.objects].reverse().find(
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
    const newObject: AnnotationObject = {
      id,
      type,
      source: "manual",
      points: [
        { x: 20, y: 80 },
        { x: 50, y: 80 },
        { x: 50, y: 20 },
      ],
    };
    applyLocalChange((current) => ({ ...current, objects: [...current.objects, newObject] }));
    setSelectedIds([id]);
  };

  const beginRectResize = (event: ReactPointerEvent, dir: string) => {
    if (!selected || selected.locked || (selected.type !== "frame" && selected.type !== "image" && selected.type !== "mosaic")) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const objectId = selected.id;
    const rect0 = selected.rect;
    const startPct = pctFromClient(event.clientX, event.clientY);
    const el = figureRef.current?.querySelector<HTMLElement>(`[data-mm-id="${objectId}"]`);
    const rectFor = (pct: Pt): RectPct => resizeRect(rect0, dir, pct.x - startPct.x, pct.y - startPct.y);
    startPointerDrag(event, {
      onMove: (pct) => {
        const next = rectFor(pct);
        if (el) {
          el.style.left = `${next.x}%`;
          el.style.top = `${next.y}%`;
          el.style.width = `${next.w}%`;
          el.style.height = `${next.h}%`;
        }
        setDraft({ rect: next });
      },
      onEnd: (pct, moved) => {
        setDraft(null);
        if (!moved) {
          return;
        }
        const next = rectFor(pct);
        applyLocalChange((current) => ({
          ...current,
          objects: current.objects.map((item) =>
            item.id === objectId && !item.locked && (item.type === "frame" || item.type === "image" || item.type === "mosaic")
              ? { ...item, rect: next }
              : item,
          ),
        }));
      },
    });
  };

  const beginPointDrag = (event: ReactPointerEvent, index: number) => {
    if (!selected || selected.locked || (selected.type !== "line" && selected.type !== "arrow")) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setSelectedPointIndex(index);
    const objectId = selected.id;
    const points0 = selected.points;
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
        setPolylinePoints(objectId, next);
        setPointHandlePositions(next);
      },
      onEnd: (pct, moved, endEvent) => {
        if (!moved) {
          return;
        }
        const next = pointsFor(snap(pct, endEvent.shiftKey));
        applyLocalChange((current) => ({
          ...current,
          objects: current.objects.map((item) =>
            item.id === objectId && (item.type === "line" || item.type === "arrow")
              ? { ...item, points: next }
              : item,
          ),
        }));
      },
    });
  };

  const addPoint = () => {
    if (!selected || (selected.type !== "line" && selected.type !== "arrow")) {
      return;
    }
    const objectId = selected.id;
    setSelectedPointIndex(selected.points.length);
    updateObject(objectId, (obj) => {
      if (obj.type !== "line" && obj.type !== "arrow") {
        return obj;
      }
      const last = obj.points[obj.points.length - 1] ?? { x: 50, y: 50 };
      return { ...obj, points: [...obj.points, { x: Math.min(last.x + 8, 100), y: last.y }] };
    });
  };

  const removePoint = (index: number) => {
    if (!selected || (selected.type !== "line" && selected.type !== "arrow")) {
      return;
    }
    updateObject(selected.id, (obj) => {
      if ((obj.type !== "line" && obj.type !== "arrow") || obj.points.length <= 2) {
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
    if (!selected || (selected.type !== "frame" && selected.type !== "image" && selected.type !== "mosaic")) {
      return;
    }
    const clamped = key === "w" || key === "h" ? Math.max(0.5, value) : value;
    updateObject(selected.id, (obj) =>
      obj.type === "frame" || obj.type === "image" || obj.type === "mosaic"
        ? { ...obj, rect: { ...obj.rect, [key]: clamped } }
        : obj,
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
    if (!selected || (selected.type !== "line" && selected.type !== "arrow")) {
      return;
    }
    updateObject(selected.id, (obj) =>
      obj.type === "line" || obj.type === "arrow"
        ? {
            ...obj,
            points: obj.points.map((point, i) => (i === index ? { ...point, [axis]: value } : point)),
          }
        : obj,
    );
  };

  const updateLineStyle = (patch: { color?: string; strokeWidth?: number }) => {
    if (!selected || (selected.type !== "line" && selected.type !== "arrow")) {
      return;
    }
    updateObject(selected.id, (obj) =>
      obj.type === "line" || obj.type === "arrow" ? { ...obj, ...patch } : obj,
    );
  };

  const updateLineType = (type: "line" | "arrow") => {
    if (!selected || (selected.type !== "line" && selected.type !== "arrow")) {
      return;
    }
    updateObject(selected.id, (obj) =>
      obj.type === "line" || obj.type === "arrow" ? { ...obj, type } : obj,
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
    if (!selected || selected.locked || selected.type !== "image") {
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
      if (currentDisplay[from]?.locked) {
        return current;
      }
      const displayed = moveItem(currentDisplay, from, to);
      return { ...current, objects: displayed.reverse() };
    });
  };

  const activeFrameRect = selected && !selected.locked && (selected.type === "frame" || selected.type === "image" || selected.type === "mosaic")
    ? (draft?.rect ?? selected.rect)
    : null;
  const activeLinePoints =
    selected && !selected.locked && (selected.type === "line" || selected.type === "arrow")
      ? selected.points
      : null;

  // line/arrow のヒット領域は React 管理のオーバーレイ SVG に描く。
  // figure の innerHTML へ手動注入すると React の再セットで黙って消えるため
  const lineObjects = annotation.objects.filter(
    (obj): obj is Extract<AnnotationObject, { type: "line" | "arrow" }> =>
      obj.type === "line" || obj.type === "arrow",
  );
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
          <IconButton label="画像" tip data-testid="add-image" onClick={() => addImageInputRef.current?.click()}>
            <IconImage />
          </IconButton>
          <input
            ref={addImageInputRef}
            data-testid="add-image-input"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void handleAddImage(file);
              }
              event.target.value = "";
            }}
          />
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
              const id = target?.dataset.mmId;
              if (!id) {
                setSelectedIds([]);
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
          <section className="border-b border-slate-100 p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <h2 className="text-xs font-semibold text-slate-700">オブジェクト</h2>
              {selectedIds.length > 1 ? (
                <span
                  className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-800"
                  data-testid="selection-count"
                >
                  {selectedIds.length}個選択
                </span>
              ) : null}
            </div>
            <p className="mb-2 text-[11px] leading-relaxed text-slate-500">
              前面 → 背面の順。⌘/Ctrl/Shift+クリックで複数選択できます。
            </p>
            <ul className="space-y-0.5">
            {[...annotation.objects].reverse().map((obj, displayIndex) => (
              <li
                key={obj.id}
                draggable={!obj.locked}
                onDragStart={() => {
                  if (!obj.locked) {
                    setDragListIndex(displayIndex);
                  }
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDropListIndex(displayIndex);
                }}
                onDragLeave={() => setDropListIndex((current) => (current === displayIndex ? null : current))}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragListIndex !== null) {
                    reorderByDisplayIndex(dragListIndex, displayIndex);
                  }
                  setDragListIndex(null);
                  setDropListIndex(null);
                }}
                onDragEnd={() => {
                  setDragListIndex(null);
                  setDropListIndex(null);
                }}
                className={cx(
                  "relative rounded-md",
                  dropListIndex === displayIndex && dragListIndex !== displayIndex &&
                    "border-t-2 border-blue-400",
                )}
              >
                <button
                  type="button"
                  data-testid={`object-item-${obj.id}`}
                  className={cx(
                    "group flex w-full items-center gap-2 rounded-md border py-1.5 pl-2 pr-9 text-left text-[13px] transition-colors duration-150",
                    obj.locked ? "cursor-default" : "cursor-grab",
                    selectedIds.includes(obj.id)
                      ? "border-blue-400 bg-blue-50 text-blue-800"
                      : "border-transparent text-slate-700 hover:bg-slate-100",
                  )}
                  onClick={(event) => {
                    if (event.metaKey || event.ctrlKey || event.shiftKey) {
                      setSelectedIds((current) =>
                        current.includes(obj.id)
                          ? current.filter((id) => id !== obj.id)
                          : [...current, obj.id],
                      );
                    } else {
                      setSelectedIds([obj.id]);
                    }
                  }}
                >
                  <span
                    className={cx(
                      "shrink-0",
                      selectedIds.includes(obj.id) ? "text-blue-600" : "text-slate-400",
                    )}
                  >
                    {objectIcon(obj.type)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{objectLabel(obj)}</span>
                  <span className="shrink-0 font-mono text-[10px] text-slate-500">{obj.id}</span>
                  <IconGrip
                    size={12}
                    className="shrink-0 text-slate-300 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                  />
                </button>
                <button
                  type="button"
                  data-testid={`object-lock-${obj.id}`}
                  className={cx(
                    "absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded transition-colors",
                    obj.locked
                      ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                      : "text-slate-400 hover:bg-slate-200 hover:text-slate-700",
                  )}
                  title={obj.locked ? "ロックを解除" : "オブジェクトをロック"}
                  aria-label={obj.locked ? `${obj.id}のロックを解除` : `${obj.id}をロック`}
                  onClick={() => toggleObjectLock(obj.id)}
                >
                  {obj.locked ? <IconLock size={12} /> : <IconUnlock size={12} />}
                </button>
              </li>
            ))}
            </ul>
          </section>
          <section className="border-b border-slate-100 p-3">
            <h2 className="mb-2 text-xs font-semibold text-slate-700">キャンバス余白</h2>
            <p className="mb-2 text-[11px] leading-relaxed text-slate-500">
              画像の外側へ注釈を置くための余白を追加します(負値で削除)。既存オブジェクトの見た目の位置は変わりません。
            </p>
            <div className="mb-2 grid grid-cols-2 gap-1.5">
              <NumberField
                label="上"
                value={marginDraft.top}
                step={10}
                testId="canvas-margin-top"
                onChange={(value) => setMarginDraft((current) => ({ ...current, top: value }))}
              />
              <NumberField
                label="右"
                value={marginDraft.right}
                step={10}
                testId="canvas-margin-right"
                onChange={(value) => setMarginDraft((current) => ({ ...current, right: value }))}
              />
              <NumberField
                label="下"
                value={marginDraft.bottom}
                step={10}
                testId="canvas-margin-bottom"
                onChange={(value) => setMarginDraft((current) => ({ ...current, bottom: value }))}
              />
              <NumberField
                label="左"
                value={marginDraft.left}
                step={10}
                testId="canvas-margin-left"
                onChange={(value) => setMarginDraft((current) => ({ ...current, left: value }))}
              />
            </div>
            <Button size="sm" data-testid="canvas-margin-apply" onClick={applyCanvasMargin}>
              適用
            </Button>
          </section>
          <section className="flex-1 p-3">
          <h2 className="mb-2 text-xs font-semibold text-slate-700">プロパティ</h2>
          {selected?.locked ? (
            <p className="mb-3 rounded-md bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
              このオブジェクトはロックされています。編集するには一覧の鍵を解除してください。
            </p>
          ) : null}
          {!selected ? (
            <p className="rounded-md bg-slate-50 px-3 py-4 text-xs leading-relaxed text-slate-500">
              オブジェクトをクリックして選択してください。バッジ・テキスト・枠・線はドラッグで移動できます。
            </p>
          ) : null}
          {selected?.type === "badge" ? (
            <div className="space-y-3 text-sm">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">番号 (n)</span>
                <input
                  type="number"
                  min={1}
                  className="h-8 w-full rounded-md border border-slate-300 bg-white px-2.5 text-sm shadow-xs transition-colors duration-150 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  value={selected.n}
                  onChange={(event) => {
                    const n = Number.parseInt(event.target.value, 10);
                    if (Number.isNaN(n) || n < 1) {
                      return;
                    }
                    updateObject(selected.id, (obj) => {
                      if (obj.type !== "badge") {
                        return obj;
                      }
                      return { ...obj, n };
                    });
                  }}
                />
              </label>
              <div>
                <span className="mb-1 block text-xs font-medium text-slate-600">位置 (%)</span>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField label="x" value={selected.at.x} testId="prop-at-x" onChange={(v) => updateAt("x", v)} />
                  <NumberField label="y" value={selected.at.y} testId="prop-at-y" onChange={(v) => updateAt("y", v)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">色</span>
                  <ColorInput
                    data-testid="prop-color"
                    value={selected.color ?? theme.color ?? DEFAULT_ANNOTATION_COLOR}
                    onChange={(event) => {
                      const color = event.target.value;
                      updateObject(selected.id, (obj) =>
                        obj.type === "badge" ? { ...obj, color } : obj,
                      );
                    }}
                  />
                </label>
                <div>
                  <span className="mb-1 block text-xs font-medium text-slate-600">直径 (px)</span>
                  <NumberField
                    label=""
                    value={selected.size ?? 22}
                    step={1}
                    min={8}
                    onChange={(v) =>
                      updateObject(selected.id, (obj) =>
                        obj.type === "badge" ? { ...obj, size: Math.max(8, Math.round(v)) } : obj,
                      )
                    }
                  />
                </div>
              </div>
              <div>
                <span className="mb-1 block text-xs font-medium text-slate-600">フォントサイズ (px)</span>
                <NumberField
                  label=""
                  value={selected.fontSize ?? theme.fontSize ?? DEFAULT_ANNOTATION_FONT_SIZE}
                  step={1}
                  min={6}
                  testId="prop-font-size"
                  onChange={(v) =>
                    updateObject(selected.id, (obj) =>
                      obj.type === "badge" ? { ...obj, fontSize: Math.max(6, Math.round(v)) } : obj,
                    )
                  }
                />
              </div>
            </div>
          ) : null}
          {selected?.type === "text" ? (
            <div className="space-y-3 text-sm">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">テキスト内容</span>
                <textarea
                  className="min-h-24 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] shadow-xs transition-colors duration-150 placeholder:text-slate-500 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  value={selected.content}
                  onChange={(event) => {
                    const content = event.target.value;
                    updateObject(selected.id, (obj) => {
                      if (obj.type !== "text") {
                        return obj;
                      }
                      return { ...obj, content };
                    });
                  }}
                />
              </label>
              <div>
                <span className="mb-1 block text-xs font-medium text-slate-600">位置 (%)</span>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField label="x" value={selected.at.x} testId="prop-at-x" onChange={(v) => updateAt("x", v)} />
                  <NumberField label="y" value={selected.at.y} testId="prop-at-y" onChange={(v) => updateAt("y", v)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">文字色</span>
                  <ColorInput
                    data-testid="prop-color"
                    value={selected.color ?? theme.color ?? DEFAULT_ANNOTATION_COLOR}
                    onChange={(event) => {
                      const color = event.target.value;
                      updateObject(selected.id, (obj) =>
                        obj.type === "text" ? { ...obj, color } : obj,
                      );
                    }}
                  />
                </label>
                <div>
                  <span className="mb-1 block text-xs font-medium text-slate-600">フォントサイズ (px)</span>
                  <NumberField
                    label=""
                    value={selected.fontSize ?? theme.fontSize ?? DEFAULT_ANNOTATION_FONT_SIZE}
                    step={1}
                    min={6}
                    testId="prop-font-size"
                    onChange={(v) =>
                      updateObject(selected.id, (obj) =>
                        obj.type === "text" ? { ...obj, fontSize: Math.max(6, Math.round(v)) } : obj,
                      )
                    }
                  />
                </div>
              </div>
            </div>
          ) : null}
          {selected?.type === "cursor" ? (
            <div className="space-y-3 text-sm">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">カーソル種類</span>
                <SelectInput
                  data-testid="cursor-icon"
                  className="w-full"
                  value={selected.icon}
                  onChange={(event) => {
                    const icon = event.target.value as CursorIcon;
                    updateObject(selected.id, (obj) =>
                      obj.type === "cursor" ? { ...obj, icon } : obj,
                    );
                  }}
                >
                  <option value="pointer">通常 (Pointer)</option>
                  <option value="move">移動 (Move)</option>
                  <option value="grab">つかむ (Grab)</option>
                  <option value="text">テキスト (Text)</option>
                  <option value="crosshair">十字 (Crosshair)</option>
                </SelectInput>
              </label>
              <div>
                <span className="mb-1 block text-xs font-medium text-slate-600">位置 (%)</span>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField label="x" value={selected.at.x} testId="prop-at-x" onChange={(v) => updateAt("x", v)} />
                  <NumberField label="y" value={selected.at.y} testId="prop-at-y" onChange={(v) => updateAt("y", v)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">色</span>
                  <ColorInput
                    data-testid="prop-color"
                    value={selected.color ?? DEFAULT_CURSOR_COLOR}
                    onChange={(event) => {
                      const color = event.target.value;
                      updateObject(selected.id, (obj) =>
                        obj.type === "cursor" ? { ...obj, color } : obj,
                      );
                    }}
                  />
                </label>
                <div>
                  <span className="mb-1 block text-xs font-medium text-slate-600">サイズ (px)</span>
                  <NumberField
                    label=""
                    value={selected.size ?? 28}
                    step={1}
                    min={8}
                    testId="cursor-size"
                    onChange={(v) =>
                      updateObject(selected.id, (obj) =>
                        obj.type === "cursor" ? { ...obj, size: Math.max(8, Math.round(v)) } : obj,
                      )
                    }
                  />
                </div>
              </div>
              <p className="text-xs leading-relaxed text-slate-500">
                SVGはHTMLへ直接埋め込まれるため、単体HTMLでも表示されます。
              </p>
            </div>
          ) : null}
          {selected?.type === "frame" ? (
            <div className="space-y-3 text-sm">
              <div>
                <span className="mb-1 block text-xs font-medium text-slate-600">位置・サイズ (%)</span>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField label="x" value={selected.rect.x} testId="prop-rect-x" onChange={(v) => updateRect("x", v)} />
                  <NumberField label="y" value={selected.rect.y} testId="prop-rect-y" onChange={(v) => updateRect("y", v)} />
                  <NumberField label="w" value={selected.rect.w} min={0.5} onChange={(v) => updateRect("w", v)} />
                  <NumberField label="h" value={selected.rect.h} min={0.5} onChange={(v) => updateRect("h", v)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">線色</span>
                  <ColorInput
                    data-testid="prop-color"
                    value={selected.color ?? theme.color ?? DEFAULT_ANNOTATION_COLOR}
                    onChange={(event) => {
                      const color = event.target.value;
                      updateObject(selected.id, (obj) =>
                        obj.type === "frame" ? { ...obj, color } : obj,
                      );
                    }}
                  />
                </label>
                <div>
                  <span className="mb-1 block text-xs font-medium text-slate-600">線幅 (px)</span>
                  <NumberField
                    label=""
                    value={selected.strokeWidth ?? 2}
                    step={1}
                    min={1}
                    testId="prop-stroke-width"
                    onChange={(v) =>
                      updateObject(selected.id, (obj) =>
                        obj.type === "frame"
                          ? { ...obj, strokeWidth: Math.max(1, Math.round(v)) }
                          : obj,
                      )
                    }
                  />
                </div>
              </div>
              <p className="text-xs leading-relaxed text-slate-500">ドラッグで移動、周囲のハンドルでリサイズできます。</p>
            </div>
          ) : null}
          {selected?.type === "image" ? (
            <div className="space-y-3 text-sm">
              <div>
                <span className="mb-1 block text-xs font-medium text-slate-600">配置 (%)</span>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField label="x" value={selected.rect.x} testId="prop-rect-x" onChange={(v) => updateRect("x", v)} />
                  <NumberField label="y" value={selected.rect.y} testId="prop-rect-y" onChange={(v) => updateRect("y", v)} />
                  <NumberField label="w" value={selected.rect.w} min={0.5} onChange={(v) => updateRect("w", v)} />
                  <NumberField label="h" value={selected.rect.h} min={0.5} onChange={(v) => updateRect("h", v)} />
                </div>
              </div>
              {(() => {
                const natural = naturalSizes[selected.src];
                if (!natural) {
                  return <p className="text-xs text-red-600">画像サイズを取得できません。</p>;
                }
                const crop = selected.crop ?? { x: 0, y: 0, w: natural.w, h: natural.h };
                return (
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-600">クロップ (画像px)</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1.5 text-[11px]"
                        onClick={() =>
                          updateObject(selected.id, (obj) =>
                            obj.type === "image"
                              ? { ...obj, crop: { x: 0, y: 0, w: natural.w, h: natural.h } }
                              : obj,
                          )
                        }
                      >
                        全体に戻す
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <NumberField label="x" value={crop.x} step={1} min={0} testId="crop-x" onChange={(v) => updateCrop("x", v)} />
                      <NumberField label="y" value={crop.y} step={1} min={0} testId="crop-y" onChange={(v) => updateCrop("y", v)} />
                      <NumberField label="w" value={crop.w} step={1} min={1} testId="crop-w" onChange={(v) => updateCrop("w", v)} />
                      <NumberField label="h" value={crop.h} step={1} min={1} testId="crop-h" onChange={(v) => updateCrop("h", v)} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      元画像 {natural.w} × {natural.h}px
                    </p>
                    <Button
                      size="sm"
                      className="mt-3 w-full"
                      onClick={() => replaceImageInputRef.current?.click()}
                    >
                      <IconImage size={14} />
                      画像ファイルを置換
                    </Button>
                    <input
                      ref={replaceImageInputRef}
                      data-testid="replace-image-input"
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          void handleReplaceImage(file);
                        }
                        event.target.value = "";
                      }}
                    />
                  </div>
                );
              })()}
            </div>
          ) : null}
          {selected?.type === "mosaic" ? (
            <div className="space-y-3 text-sm">
              <div>
                <span className="mb-1 block text-xs font-medium text-slate-600">適用範囲 (%)</span>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField label="x" value={selected.rect.x} testId="prop-rect-x" onChange={(v) => updateRect("x", v)} />
                  <NumberField label="y" value={selected.rect.y} testId="prop-rect-y" onChange={(v) => updateRect("y", v)} />
                  <NumberField label="w" value={selected.rect.w} min={0.5} onChange={(v) => updateRect("w", v)} />
                  <NumberField label="h" value={selected.rect.h} min={0.5} onChange={(v) => updateRect("h", v)} />
                </div>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">対象画像</span>
                <SelectInput
                  data-testid="mosaic-target"
                  className="w-full"
                  value={selected.targetImageId}
                  onChange={(event) => {
                    const targetImageId = event.target.value;
                    updateObject(selected.id, (obj) =>
                      obj.type === "mosaic" ? { ...obj, targetImageId } : obj,
                    );
                  }}
                >
                  {annotation.objects.filter((obj) => obj.type === "image").map((image) => (
                    <option key={image.id} value={image.id}>{image.id}</option>
                  ))}
                </SelectInput>
              </label>
              <div>
                <span className="mb-1 block text-xs font-medium text-slate-600">モザイクの粗さ (px)</span>
                <NumberField
                  label=""
                  value={selected.blockSize ?? 12}
                  step={1}
                  min={2}
                  testId="mosaic-block-size"
                  onChange={(value) => updateObject(selected.id, (obj) =>
                    obj.type === "mosaic" ? { ...obj, blockSize: Math.max(2, Math.round(value)) } : obj,
                  )}
                />
              </div>
              <p className="text-xs leading-relaxed text-slate-500">
                納品時に対象画像の画素へ実際に適用されます。元画像はプロジェクト内に非破壊で保持されます。
              </p>
            </div>
          ) : null}
          {selected && (selected.type === "line" || selected.type === "arrow") ? (
            <div className="space-y-3 text-sm">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">線種</span>
                <SelectInput
                  data-testid="line-type"
                  className="w-full"
                  value={selected.type}
                  onChange={(event) => updateLineType(event.target.value as "line" | "arrow")}
                >
                  <option value="line">Line（線）</option>
                  <option value="arrow">Arrow（矢印）</option>
                </SelectInput>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">色</span>
                  <ColorInput
                    data-testid="prop-color"
                    value={selected.color ?? theme.color ?? DEFAULT_ANNOTATION_COLOR}
                    onChange={(event) => updateLineStyle({ color: event.target.value })}
                  />
                </label>
                <div>
                  <span className="mb-1 block text-xs font-medium text-slate-600">太さ (px)</span>
                  <NumberField
                    label=""
                    value={selected.strokeWidth ?? 2}
                    step={1}
                    min={1}
                    testId="prop-stroke-width"
                    onChange={(v) => updateLineStyle({ strokeWidth: Math.max(1, Math.round(v)) })}
                  />
                </div>
              </div>
              <div>
                <div className="mb-1.5 text-xs font-medium text-slate-600">
                  点({selected.points.length})
                </div>
                <ul className="mb-2 space-y-1">
                  {selected.points.map((point, index) => (
                    <li
                      key={index}
                      data-testid={`point-row-${index}`}
                      className={cx(
                        "flex items-center gap-1 rounded-md px-1 py-1 transition-colors duration-150",
                        selectedPointIndex === index
                          ? "bg-blue-100 ring-1 ring-blue-300"
                          : "hover:bg-slate-50",
                      )}
                      onClick={() => setSelectedPointIndex(index)}
                    >
                      <span className="w-3 shrink-0 text-center text-[11px] text-slate-500">{index + 1}</span>
                      <NumberField
                        label="x"
                        value={point.x}
                        testId={`prop-point-${index}-x`}
                        onFocus={() => setSelectedPointIndex(index)}
                        onChange={(v) => updatePointValue(index, "x", v)}
                      />
                      <NumberField
                        label="y"
                        value={point.y}
                        onFocus={() => setSelectedPointIndex(index)}
                        onChange={(v) => updatePointValue(index, "y", v)}
                      />
                      <button
                        type="button"
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 transition-colors duration-150 hover:bg-slate-200 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={selected.points.length <= 2}
                        onClick={() => removePoint(index)}
                        title="点を削除"
                        aria-label="点を削除"
                      >
                        <IconX size={11} />
                      </button>
                    </li>
                  ))}
                </ul>
                <Button size="sm" onClick={addPoint}>
                  <IconPlus size={12} />
                  点を追加
                </Button>
              </div>
              <p className="text-xs leading-relaxed text-slate-500">
                線上を Option(Alt)+クリックで点を追加できます。点のドラッグは他の点の x/y
                に自動吸着し、Shift 押下中は隣の点を基準に 45° 刻みでスナップします。
              </p>
            </div>
          ) : null}
          </section>
          <footer className="mt-auto border-t border-slate-100 px-3 py-2.5 text-[11px] leading-relaxed text-slate-500">
            <Kbd>⌘Z</Kbd> 取り消し ・ <Kbd>⌘C</Kbd>
            <Kbd>⌘V</Kbd> 複製 ・ <Kbd>Delete</Kbd> 削除 ・ 矢印キーで 0.1% 移動(
            <Kbd>⇧</Kbd> で 1%)
          </footer>
        </aside>
      </div>
    </div>
  );
}
