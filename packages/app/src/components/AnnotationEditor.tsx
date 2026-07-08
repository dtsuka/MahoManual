import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { renderFigure } from "@mahomanual/core/render";
import {
  annotationThemeCss,
  DEFAULT_ANNOTATION_COLOR,
  DEFAULT_ANNOTATION_FONT_SIZE,
  THEME_FIGURE_CSS,
  type AnnotationTheme,
} from "@mahomanual/core/theme";
import type { AnnotationFile, AnnotationObject } from "@mahomanual/core/schema";
import {
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
  translateObjects,
} from "../lib/annotation-operations.js";

// 点ドラッグ時に他の点の x/y へ吸着する距離(%)。
// 解除距離を大きくする(ヒステリシス)ことで吸着⇄解除のフリッカーを防ぐ
const SNAP_THRESHOLD_PCT = 0.7;
const SNAP_RELEASE_PCT = 1.5;

interface AnnotationEditorProps {
  project: string;
  annotationId: string;
  onBack?: () => void;
  onRenamed?: (id: string) => void;
}

type MovableObject = Extract<AnnotationObject, { type: "badge" | "text" | "frame" }>;

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
  points?: Pt[];
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
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  testId?: string;
  step?: number;
  min?: number;
}) {
  return (
    <label className="flex items-center gap-1">
      <span className="w-4 shrink-0 text-xs text-slate-500">{label}</span>
      <input
        type="number"
        step={step}
        min={min}
        data-testid={testId}
        className="w-full rounded border border-slate-300 bg-white px-1.5 py-0.5 text-sm"
        value={Math.round(value * 100) / 100}
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
    case "image":
      return `image ${obj.src.split("/").pop() ?? obj.src}`;
    case "frame":
      return "frame";
    case "line":
      return "line";
    case "arrow":
      return "arrow";
  }
}

export function AnnotationEditor({ project, annotationId, onBack, onRenamed }: AnnotationEditorProps) {
  const [annotation, setAnnotation] = useState<AnnotationFile | null>(null);
  const [naturalSizes, setNaturalSizes] = useState<Record<string, { w: number; h: number }>>({});
  const [theme, setTheme] = useState<AnnotationTheme>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [status, setStatus] = useState<string>("");
  const [nextAnnotationId, setNextAnnotationId] = useState(annotationId);
  const [error, setError] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState<DraftShape | null>(null);
  // オブジェクト一覧の D&D 並べ替え(表示 index = 前面から)
  const [dragListIndex, setDragListIndex] = useState<number | null>(null);
  const [dropListIndex, setDropListIndex] = useState<number | null>(null);
  // 未保存編集中に外部(AI/CLI)からの変更を検知したとき、上書きせず退避して確認を挟む
  const [externalPayload, setExternalPayload] = useState<AnnotationPayload | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const figureRef = useRef<HTMLDivElement>(null);
  const annotationRef = useRef<AnnotationFile | null>(null);
  const dirtyRef = useRef(false);
  const copiedIdsRef = useRef<string[]>([]);
  const replaceImageInputRef = useRef<HTMLInputElement>(null);
  const selectedId = selectedIds.at(-1) ?? null;

  const figureHtml = useMemo(() => {
    if (!annotation) {
      return "";
    }
    const taggable = annotation.objects.filter(
      (obj): obj is MovableObject => obj.type === "badge" || obj.type === "text" || obj.type === "frame",
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
    setAnnotation(payload.annotation);
    setNaturalSizes(payload.naturalSizes);
    setTheme(payload.theme ?? {});
    dirtyRef.current = false;
    setDirty(false);
    setExternalPayload(null);
  };

  // GUI 上の編集はすべてここを通し、annotationRef(最新値)と dirty を同期する
  const applyLocalChange = (updater: (current: AnnotationFile) => AnnotationFile) => {
    setAnnotation((current) => {
      if (!current) {
        return current;
      }
      const next = updater(current);
      annotationRef.current = next;
      return next;
    });
    dirtyRef.current = true;
    setDirty(true);
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
  }, [selectedId]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
        return;
      }
      if (selectedIds.length === 0 || !annotationRef.current) {
        return;
      }
      const selected = new Set(selectedIds);
      const commandKey = event.metaKey || event.ctrlKey;
      if (commandKey && event.key.toLowerCase() === "c") {
        event.preventDefault();
        copiedIdsRef.current = [...selectedIds];
        return;
      }
      if (commandKey && event.key.toLowerCase() === "v" && copiedIdsRef.current.length > 0) {
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
          objects: current.objects.filter((obj) => !selected.has(obj.id)),
        }));
        setSelectedIds([]);
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
    if (!obj || obj.type === "image") {
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

    if (obj.type === "badge" || obj.type === "text") {
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

    if (obj.type === "frame") {
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
        setDraft({ points: next });
      },
      onEnd: (pct, moved) => {
        setDraft(null);
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
    return <div className="p-6 text-red-600">{error}</div>;
  }
  if (!annotation) {
    return <div className="p-6">読み込み中…</div>;
  }

  const selected = annotation.objects.find((obj) => obj.id === selectedId) ?? null;

  const updateObject = (objectId: string, updater: (obj: AnnotationObject) => AnnotationObject) => {
    applyLocalChange((current) => ({
      ...current,
      objects: current.objects.map((obj) => (obj.id === objectId ? updater(obj) : obj)),
    }));
  };

  const addObject = (type: MovableObject["type"]) => {
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

  const beginFrameResize = (event: ReactPointerEvent, dir: string) => {
    if (!selected || selected.type !== "frame") {
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
            item.id === objectId && item.type === "frame" ? { ...item, rect: next } : item,
          ),
        }));
      },
    });
  };

  const beginPointDrag = (event: ReactPointerEvent, index: number) => {
    if (!selected || (selected.type !== "line" && selected.type !== "arrow")) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
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
        setDraft({ points: next });
      },
      onEnd: (pct, moved, endEvent) => {
        setDraft(null);
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
  };

  // サイドパネルの数値・スタイル入力(選択中オブジェクトの型に応じて使用)
  const updateAt = (axis: "x" | "y", value: number) => {
    if (!selected || (selected.type !== "badge" && selected.type !== "text")) {
      return;
    }
    updateObject(selected.id, (obj) =>
      obj.type === "badge" || obj.type === "text" ? { ...obj, at: { ...obj.at, [axis]: value } } : obj,
    );
  };

  const updateRect = (key: "x" | "y" | "w" | "h", value: number) => {
    if (!selected || (selected.type !== "frame" && selected.type !== "image")) {
      return;
    }
    const clamped = key === "w" || key === "h" ? Math.max(0.5, value) : value;
    updateObject(selected.id, (obj) =>
      obj.type === "frame" || obj.type === "image"
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

  const handleSave = async () => {
    try {
      const saved = await saveAnnotation(project, annotationId, annotationRef.current ?? annotation);
      // サーバーで zod 正規化された内容を保持し、保存エコーの同一判定を確実にする
      annotationRef.current = saved.annotation;
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
    if (!selected || selected.type !== "image") {
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
      const displayed = moveItem([...current.objects].reverse(), from, to);
      return { ...current, objects: displayed.reverse() };
    });
  };

  const activeFrameRect = selected?.type === "frame" ? (draft?.rect ?? selected.rect) : null;
  const activeLinePoints =
    selected && (selected.type === "line" || selected.type === "arrow")
      ? (draft?.points ?? selected.points)
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
    <div className="flex h-full min-h-screen flex-col" data-testid="annotation-editor">
      <style>{THEME_FIGURE_CSS}</style>
      {annotationThemeCss(theme) ? <style>{annotationThemeCss(theme)}</style> : null}
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        {onBack ? (
          <button type="button" className="rounded border px-3 py-1" onClick={onBack}>
            戻る
          </button>
        ) : null}
        <h1 className="text-lg font-semibold">
          {project} / {annotationId}
        </h1>
        <div className="flex items-center gap-1">
          <input
            data-testid="rename-id-input"
            className="w-48 rounded border border-slate-300 px-2 py-1 text-sm"
            value={nextAnnotationId}
            aria-label="画像ID"
            onChange={(event) => setNextAnnotationId(event.target.value)}
          />
          <button
            type="button"
            data-testid="rename-id-button"
            className="rounded border border-slate-300 bg-white px-2 py-1 text-sm disabled:opacity-40"
            disabled={dirty || !nextAnnotationId.trim() || nextAnnotationId.trim() === annotationId}
            title={dirty ? "先に変更を保存してください" : "画像IDを変更"}
            onClick={() => void handleRename()}
          >
            ID変更
          </button>
        </div>
        {dirty ? <span className="text-sm text-amber-600">未保存</span> : null}
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            className="rounded bg-slate-100 px-3 py-1"
            data-testid="add-badge"
            onClick={() => addObject("badge")}
          >
            + Badge
          </button>
          <button type="button" className="rounded bg-slate-100 px-3 py-1" onClick={() => addObject("text")}>
            + Text
          </button>
          <button type="button" className="rounded bg-slate-100 px-3 py-1" onClick={() => addObject("frame")}>
            + Frame
          </button>
          <button type="button" className="rounded bg-slate-100 px-3 py-1" onClick={() => addLine("line")}>
            + Line
          </button>
          <button type="button" className="rounded bg-slate-100 px-3 py-1" onClick={() => addLine("arrow")}>
            + Arrow
          </button>
          <button
            type="button"
            className="rounded bg-blue-600 px-4 py-1 text-white"
            data-testid="save-button"
            onClick={() => void handleSave()}
          >
            保存
          </button>
        </div>
      </header>
      {status ? <div className="bg-green-50 px-4 py-2 text-green-700">{status}</div> : null}
      {externalPayload ? (
        <div
          className="flex items-center gap-3 bg-amber-50 px-4 py-2 text-amber-800"
          data-testid="external-change-banner"
        >
          <span>外部で注釈が変更されました。読み込むと未保存の編集は失われます。</span>
          <button
            type="button"
            className="rounded border border-amber-400 px-2 py-0.5"
            data-testid="apply-external"
            onClick={() => applyPayload(externalPayload)}
          >
            外部の内容を読み込む
          </button>
          <button
            type="button"
            className="rounded border border-slate-300 px-2 py-0.5"
            onClick={() => setExternalPayload(null)}
          >
            無視する
          </button>
        </div>
      ) : null}
      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-1 overflow-auto p-6">
          <div
            ref={wrapRef}
            className="relative mx-auto"
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
                    points={toCanvasPoints(
                      selectedId === obj.id && draft?.points ? draft.points : obj.points,
                    )}
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
                      onPointerDown={(event) => beginFrameResize(event, handle.dir)}
                    />
                  ))
                : null}
              {activeLinePoints
                ? activeLinePoints.map((point, index) => (
                    <div
                      key={index}
                      data-testid={`point-handle-${index}`}
                      className="mm-editor-handle mm-editor-handle--point"
                      style={{ left: `${point.x}%`, top: `${point.y}%`, cursor: "move" }}
                      onPointerDown={(event) => beginPointDrag(event, index)}
                    />
                  ))
                : null}
            </div>
          </div>
        </div>
        <aside className="w-72 shrink-0 overflow-y-auto border-l border-slate-200 bg-slate-50 p-4">
          <h2 className="mb-1 text-sm font-semibold text-slate-700">オブジェクト</h2>
          {selectedIds.length > 1 ? (
            <div
              className="mb-2 rounded bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800"
              data-testid="selection-count"
            >
              {selectedIds.length}個選択
            </div>
          ) : null}
          <p className="mb-2 text-xs text-slate-400">
            前面 → 背面の順。⌘/Ctrl/Shift+クリックで複数選択できます。
          </p>
          <ul className="mb-4 space-y-1">
            {[...annotation.objects].reverse().map((obj, displayIndex) => (
              <li
                key={obj.id}
                draggable
                onDragStart={() => setDragListIndex(displayIndex)}
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
                className={dropListIndex === displayIndex && dragListIndex !== displayIndex ? "border-t-2 border-blue-400" : ""}
              >
                <button
                  type="button"
                  data-testid={`object-item-${obj.id}`}
                  className={`w-full cursor-grab rounded border px-2 py-1 text-left text-sm ${
                    selectedIds.includes(obj.id)
                      ? "border-blue-400 bg-blue-50 text-blue-800"
                      : "border-slate-200 bg-white text-slate-700 hover:border-blue-300"
                  }`}
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
                  {objectLabel(obj)}
                  <span className="ml-1 text-xs text-slate-400">{obj.id}</span>
                </button>
              </li>
            ))}
          </ul>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">プロパティ</h2>
          {!selected ? (
            <p className="text-sm text-slate-500">
              オブジェクトをクリックして選択してください。バッジ・テキスト・枠・線はドラッグで移動できます。
            </p>
          ) : null}
          {selected?.type === "badge" ? (
            <div className="space-y-3 text-sm">
              <label className="block">
                <span className="mb-1 block font-medium text-slate-700">番号 (n)</span>
                <input
                  type="number"
                  min={1}
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1"
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
                <span className="mb-1 block font-medium text-slate-700">位置 (%)</span>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField label="x" value={selected.at.x} testId="prop-at-x" onChange={(v) => updateAt("x", v)} />
                  <NumberField label="y" value={selected.at.y} testId="prop-at-y" onChange={(v) => updateAt("y", v)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-700">色</span>
                  <input
                    type="color"
                    data-testid="prop-color"
                    className="h-8 w-full cursor-pointer rounded border border-slate-300 bg-white"
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
                  <span className="mb-1 block text-xs font-medium text-slate-700">直径 (px)</span>
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
                <span className="mb-1 block text-xs font-medium text-slate-700">フォントサイズ (px)</span>
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
                <span className="mb-1 block font-medium text-slate-700">テキスト内容</span>
                <textarea
                  className="min-h-24 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
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
                <span className="mb-1 block font-medium text-slate-700">位置 (%)</span>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField label="x" value={selected.at.x} testId="prop-at-x" onChange={(v) => updateAt("x", v)} />
                  <NumberField label="y" value={selected.at.y} testId="prop-at-y" onChange={(v) => updateAt("y", v)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-700">文字色</span>
                  <input
                    type="color"
                    data-testid="prop-color"
                    className="h-8 w-full cursor-pointer rounded border border-slate-300 bg-white"
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
                  <span className="mb-1 block text-xs font-medium text-slate-700">フォントサイズ (px)</span>
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
          {selected?.type === "frame" ? (
            <div className="space-y-3 text-sm">
              <div>
                <span className="mb-1 block font-medium text-slate-700">位置・サイズ (%)</span>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField label="x" value={selected.rect.x} testId="prop-rect-x" onChange={(v) => updateRect("x", v)} />
                  <NumberField label="y" value={selected.rect.y} testId="prop-rect-y" onChange={(v) => updateRect("y", v)} />
                  <NumberField label="w" value={selected.rect.w} min={0.5} onChange={(v) => updateRect("w", v)} />
                  <NumberField label="h" value={selected.rect.h} min={0.5} onChange={(v) => updateRect("h", v)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-700">線色</span>
                  <input
                    type="color"
                    data-testid="prop-color"
                    className="h-8 w-full cursor-pointer rounded border border-slate-300 bg-white"
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
                  <span className="mb-1 block text-xs font-medium text-slate-700">線幅 (px)</span>
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
              <p className="text-xs text-slate-500">ドラッグで移動、周囲のハンドルでリサイズできます。</p>
            </div>
          ) : null}
          {selected?.type === "image" ? (
            <div className="space-y-3 text-sm">
              <div>
                <span className="mb-1 block font-medium text-slate-700">配置 (%)</span>
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
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-medium text-slate-700">クロップ (画像px)</span>
                      <button
                        type="button"
                        className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs"
                        onClick={() =>
                          updateObject(selected.id, (obj) =>
                            obj.type === "image"
                              ? { ...obj, crop: { x: 0, y: 0, w: natural.w, h: natural.h } }
                              : obj,
                          )
                        }
                      >
                        全体に戻す
                      </button>
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
                    <button
                      type="button"
                      className="mt-3 w-full rounded border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100"
                      onClick={() => replaceImageInputRef.current?.click()}
                    >
                      画像ファイルを置換
                    </button>
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
          {selected && (selected.type === "line" || selected.type === "arrow") ? (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-700">色</span>
                  <input
                    type="color"
                    data-testid="prop-color"
                    className="h-8 w-full cursor-pointer rounded border border-slate-300 bg-white"
                    value={selected.color ?? theme.color ?? DEFAULT_ANNOTATION_COLOR}
                    onChange={(event) => updateLineStyle({ color: event.target.value })}
                  />
                </label>
                <div>
                  <span className="mb-1 block text-xs font-medium text-slate-700">太さ (px)</span>
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
                <div className="mb-1 font-medium text-slate-700">点({selected.points.length})</div>
                <ul className="mb-2 space-y-1">
                  {selected.points.map((point, index) => (
                    <li key={index} className="flex items-center gap-1">
                      <span className="w-3 shrink-0 text-xs text-slate-400">{index + 1}</span>
                      <NumberField
                        label="x"
                        value={point.x}
                        testId={`prop-point-${index}-x`}
                        onChange={(v) => updatePointValue(index, "x", v)}
                      />
                      <NumberField
                        label="y"
                        value={point.y}
                        onChange={(v) => updatePointValue(index, "y", v)}
                      />
                      <button
                        type="button"
                        className="shrink-0 rounded border border-slate-300 px-1.5 text-xs disabled:opacity-40"
                        disabled={selected.points.length <= 2}
                        onClick={() => removePoint(index)}
                        title="点を削除"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs"
                  onClick={addPoint}
                >
                  + 点を追加
                </button>
              </div>
              <p className="text-xs text-slate-500">
                線上を Option(Alt)+クリックで点を追加できます。点のドラッグは他の点の x/y
                に自動吸着し、Shift 押下中は隣の点を基準に 45° 刻みでスナップします。
              </p>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
