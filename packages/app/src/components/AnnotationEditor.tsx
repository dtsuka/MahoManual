import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { renderFigure } from "@mahomanual/core/render";
import { THEME_FIGURE_CSS } from "@mahomanual/core/theme";
import type { AnnotationFile, AnnotationObject } from "@mahomanual/core/schema";
import {
  createObjectId,
  injectObjectIds,
  nextBadgeNumber,
  rewriteFigureHtml,
  saveAnnotation,
  subscribeProjectWatch,
} from "../lib/api.js";
import { resizeRect, type RectPct } from "../lib/geometry.js";

interface AnnotationEditorProps {
  project: string;
  annotationId: string;
  onBack?: () => void;
}

type MovableObject = Extract<AnnotationObject, { type: "badge" | "text" | "frame" }>;

interface Pt {
  x: number;
  y: number;
}

interface AnnotationPayload {
  annotation: AnnotationFile;
  naturalSizes: Record<string, { w: number; h: number }>;
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

export function AnnotationEditor({ project, annotationId, onBack }: AnnotationEditorProps) {
  const [annotation, setAnnotation] = useState<AnnotationFile | null>(null);
  const [naturalSizes, setNaturalSizes] = useState<Record<string, { w: number; h: number }>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState<DraftShape | null>(null);
  // 未保存編集中に外部(AI/CLI)からの変更を検知したとき、上書きせず退避して確認を挟む
  const [externalPayload, setExternalPayload] = useState<AnnotationPayload | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const figureRef = useRef<HTMLDivElement>(null);
  const annotationRef = useRef<AnnotationFile | null>(null);
  const dirtyRef = useRef(false);

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
      if (event.key !== "Delete" && event.key !== "Backspace") {
        return;
      }
      if (!selectedId || !annotation) {
        return;
      }
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
        return;
      }
      event.preventDefault();
      applyLocalChange((current) => ({
        ...current,
        objects: current.objects.filter((obj) => obj.id !== selectedId),
      }));
      setSelectedId(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId, annotation]);

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
      onMove: (pct: Pt) => void;
      onEnd: (pct: Pt, moved: boolean) => void;
    },
  ) => {
    const startClient = { x: start.clientX, y: start.clientY };
    let moved = false;
    const onPointerMove = (event: PointerEvent) => {
      if (!moved && Math.hypot(event.clientX - startClient.x, event.clientY - startClient.y) < 3) {
        return;
      }
      moved = true;
      handlers.onMove(pctFromClient(event.clientX, event.clientY));
    };
    const onPointerUp = (event: PointerEvent) => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      handlers.onEnd(pctFromClient(event.clientX, event.clientY), moved);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const setPolylinePoints = (element: Element, points: Pt[]) => {
    const canvas = annotationRef.current?.canvas;
    if (!canvas) {
      return;
    }
    const value = points
      .map((point) => `${(point.x / 100) * canvas.width},${(point.y / 100) * canvas.height}`)
      .join(" ");
    element.setAttribute("points", value);
  };

  // figure DOM(dangerouslySetInnerHTML)へのドラッグ配線。
  // badge/text は中心移動、frame は矩形移動、line/arrow は全点の平行移動
  useEffect(() => {
    if (!figureRef.current || !annotation || !figureHtml) {
      return;
    }
    const root = figureRef.current;
    const cleanups: Array<() => void> = [];

    for (const element of root.querySelectorAll<Element>("[data-mm-id]")) {
      const objectId = element.getAttribute("data-mm-id");
      if (!objectId) {
        continue;
      }
      const obj = annotation.objects.find((item) => item.id === objectId);
      if (!obj || obj.type === "image") {
        continue;
      }

      const onPointerDown = (event: Event) => {
        const pointer = event as PointerEvent;
        pointer.preventDefault();
        pointer.stopPropagation();
        setSelectedId(objectId);
        const startPct = pctFromClient(pointer.clientX, pointer.clientY);

        if (obj.type === "badge" || obj.type === "text") {
          // 掴んだ点と中心のズレを保持(クリックだけで中心が吸い付かないように)
          const grab = { x: obj.at.x - startPct.x, y: obj.at.y - startPct.y };
          const el = element as HTMLElement;
          startPointerDrag(pointer, {
            onMove: (pct) => {
              el.style.left = `${pct.x + grab.x}%`;
              el.style.top = `${pct.y + grab.y}%`;
            },
            onEnd: (pct, moved) => {
              if (!moved) {
                return;
              }
              const at = { x: pct.x + grab.x, y: pct.y + grab.y };
              applyLocalChange((current) => ({
                ...current,
                objects: current.objects.map((item) =>
                  item.id === objectId && (item.type === "badge" || item.type === "text")
                    ? { ...item, at }
                    : item,
                ),
              }));
            },
          });
          return;
        }

        if (obj.type === "frame") {
          const rect0 = obj.rect;
          const grab = { x: rect0.x - startPct.x, y: rect0.y - startPct.y };
          const el = element as HTMLElement;
          const rectFor = (pct: Pt): RectPct => ({ ...rect0, x: pct.x + grab.x, y: pct.y + grab.y });
          startPointerDrag(pointer, {
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
              applyLocalChange((current) => ({
                ...current,
                objects: current.objects.map((item) =>
                  item.id === objectId && item.type === "frame" ? { ...item, rect: next } : item,
                ),
              }));
            },
          });
          return;
        }

        // line / arrow: 全点を平行移動
        const points0 = obj.points;
        const pointsFor = (pct: Pt): Pt[] =>
          points0.map((point) => ({
            x: point.x + pct.x - startPct.x,
            y: point.y + pct.y - startPct.y,
          }));
        startPointerDrag(pointer, {
          onMove: (pct) => {
            const next = pointsFor(pct);
            setPolylinePoints(element, next);
            setDraft({ points: next });
          },
          onEnd: (pct, moved) => {
            setDraft(null);
            if (!moved) {
              return;
            }
            const next = pointsFor(pct);
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

      element.addEventListener("pointerdown", onPointerDown);
      cleanups.push(() => element.removeEventListener("pointerdown", onPointerDown));
    }

    return () => cleanups.forEach((cleanup) => cleanup());
  }, [annotation, figureHtml]);

  useEffect(() => {
    if (!figureRef.current) {
      return;
    }
    const nodes = figureRef.current.querySelectorAll("[data-mm-id]");
    nodes.forEach((node) => node.classList.remove("is-selected"));
    if (!selectedId) {
      return;
    }
    figureRef.current.querySelector(`[data-mm-id="${selectedId}"]`)?.classList.add("is-selected");
  }, [selectedId, figureHtml]);

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
    setSelectedId(id);
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
    setSelectedId(id);
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
    const el = figureRef.current?.querySelector(`[data-mm-id="${objectId}"]`);
    const pointsFor = (pct: Pt): Pt[] => points0.map((point, i) => (i === index ? pct : point));
    startPointerDrag(event, {
      onMove: (pct) => {
        const next = pointsFor(pct);
        if (el) {
          setPolylinePoints(el, next);
        }
        setDraft({ points: next });
      },
      onEnd: (pct, moved) => {
        setDraft(null);
        if (!moved) {
          return;
        }
        const next = pointsFor(pct);
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

  const activeFrameRect = selected?.type === "frame" ? (draft?.rect ?? selected.rect) : null;
  const activeLinePoints =
    selected && (selected.type === "line" || selected.type === "arrow")
      ? (draft?.points ?? selected.points)
      : null;

  return (
    <div className="flex h-full min-h-screen flex-col" data-testid="annotation-editor">
      <style>{THEME_FIGURE_CSS}</style>
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        {onBack ? (
          <button type="button" className="rounded border px-3 py-1" onClick={onBack}>
            戻る
          </button>
        ) : null}
        <h1 className="text-lg font-semibold">
          {project} / {annotationId}
        </h1>
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
          <div ref={wrapRef} className="relative mx-auto" style={{ maxWidth: annotation.canvas.width }}>
            <div
              ref={figureRef}
              className="mm-editor-figure"
              dangerouslySetInnerHTML={{ __html: figureHtml }}
              onClick={(event) => {
                const target = (event.target as HTMLElement).closest<HTMLElement>("[data-mm-id]");
                setSelectedId(target?.dataset.mmId ?? null);
              }}
            />
            {/* 編集ハンドルは figure と同じ%座標系のオーバーレイに描く */}
            <div className="pointer-events-none absolute inset-0">
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
          <p className="mb-2 text-xs text-slate-400">前面 → 背面の順。クリックで選択できます。</p>
          <ul className="mb-4 space-y-1">
            {[...annotation.objects].reverse().map((obj) => (
              <li key={obj.id}>
                <button
                  type="button"
                  data-testid={`object-item-${obj.id}`}
                  className={`w-full rounded border px-2 py-1 text-left text-sm ${
                    obj.id === selectedId
                      ? "border-blue-400 bg-blue-50 text-blue-800"
                      : "border-slate-200 bg-white text-slate-700 hover:border-blue-300"
                  }`}
                  onClick={() => setSelectedId(obj.id)}
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
          {selected?.type === "text" ? (
            <label className="block text-sm">
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
          ) : null}
          {selected?.type === "badge" ? (
            <label className="block text-sm">
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
          ) : null}
          {selected?.type === "frame" ? (
            <p className="text-sm text-slate-500">枠はドラッグで移動、周囲のハンドルでリサイズできます。</p>
          ) : null}
          {selected && (selected.type === "line" || selected.type === "arrow") ? (
            <div className="text-sm">
              <div className="mb-1 font-medium text-slate-700">点({selected.points.length})</div>
              <ul className="mb-2 space-y-1">
                {selected.points.map((point, index) => (
                  <li key={index} className="flex items-center gap-2">
                    <span className="text-slate-500">
                      {index + 1}: ({point.x.toFixed(1)}, {point.y.toFixed(1)})
                    </span>
                    <button
                      type="button"
                      className="rounded border border-slate-300 px-1.5 text-xs disabled:opacity-40"
                      disabled={selected.points.length <= 2}
                      onClick={() => removePoint(index)}
                    >
                      削除
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
              <p className="mt-2 text-xs text-slate-500">
                キャンバス上の丸ハンドルをドラッグして点を移動、線自体のドラッグで全体を移動できます。
              </p>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
