import { useEffect, useMemo, useRef, useState } from "react";
import Moveable from "react-moveable";
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

interface AnnotationEditorProps {
  project: string;
  annotationId: string;
  onBack?: () => void;
}

type MovableObject = Extract<
  AnnotationObject,
  { type: "badge" | "text" | "frame" }
>;

function isMovable(obj: AnnotationObject): obj is MovableObject {
  return obj.type === "badge" || obj.type === "text" || obj.type === "frame";
}

export function AnnotationEditor({ project, annotationId, onBack }: AnnotationEditorProps) {
  const [annotation, setAnnotation] = useState<AnnotationFile | null>(null);
  const [naturalSizes, setNaturalSizes] = useState<Record<string, { w: number; h: number }>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const figureRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLElement | null>(null);

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

  const load = async () => {
    const response = await fetch(
      `/api/projects/${encodeURIComponent(project)}/annotations/${encodeURIComponent(annotationId)}`,
    );
    if (!response.ok) {
      throw new Error("注釈の読み込みに失敗しました");
    }
    const payload = (await response.json()) as {
      annotation: AnnotationFile;
      naturalSizes: Record<string, { w: number; h: number }>;
    };
    setAnnotation(payload.annotation);
    setNaturalSizes(payload.naturalSizes);
  };

  useEffect(() => {
    void load().catch((err: Error) => setError(err.message));
  }, [project, annotationId]);

  useEffect(() => {
    return subscribeProjectWatch(project, (event) => {
      if (event.path === `annotations/${annotationId}.json`) {
        void load().catch((err: Error) => setError(err.message));
      }
    });
  }, [project, annotationId]);

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
      setAnnotation({
        ...annotation,
        objects: annotation.objects.filter((obj) => obj.id !== selectedId),
      });
      setSelectedId(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId, annotation]);

  useEffect(() => {
    if (!figureRef.current || !annotation || !figureHtml) {
      return;
    }
    const root = figureRef.current;
    const cleanups: Array<() => void> = [];

    for (const element of root.querySelectorAll<HTMLElement>("[data-mm-id]")) {
      const objectId = element.dataset.mmId;
      if (!objectId) {
        continue;
      }
      const obj = annotation.objects.find((item) => item.id === objectId);
      if (!obj || (obj.type !== "badge" && obj.type !== "text")) {
        continue;
      }

      const onPointerDown = (event: PointerEvent) => {
        event.preventDefault();
        event.stopPropagation();
        setSelectedId(objectId);
        element.setPointerCapture(event.pointerId);
        const figure = root.querySelector("figure");
        if (!figure) {
          return;
        }

        const updatePosition = (clientX: number, clientY: number) => {
          const figureBox = figure.getBoundingClientRect();
          const x = ((clientX - figureBox.left) / figureBox.width) * 100;
          const y = ((clientY - figureBox.top) / figureBox.height) * 100;
          element.style.left = `${x}%`;
          element.style.top = `${y}%`;
          return { x, y };
        };

        const onPointerMove = (moveEvent: PointerEvent) => {
          updatePosition(moveEvent.clientX, moveEvent.clientY);
        };

        const onPointerUp = (upEvent: PointerEvent) => {
          element.releasePointerCapture(upEvent.pointerId);
          window.removeEventListener("pointermove", onPointerMove);
          window.removeEventListener("pointerup", onPointerUp);
          const point = updatePosition(upEvent.clientX, upEvent.clientY);
          setAnnotation((current) => {
            if (!current) {
              return current;
            }
            return {
              ...current,
              objects: current.objects.map((item) =>
                item.id === objectId && (item.type === "badge" || item.type === "text")
                  ? { ...item, at: point }
                  : item,
              ),
            };
          });
        };

        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);
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
    const nodes = figureRef.current.querySelectorAll<HTMLElement>("[data-mm-id]");
    nodes.forEach((node) => node.classList.remove("is-selected"));
    if (!selectedId) {
      targetRef.current = null;
      return;
    }
    const selectedNode = figureRef.current.querySelector<HTMLElement>(`[data-mm-id="${selectedId}"]`);
    if (selectedNode) {
      selectedNode.classList.add("is-selected");
      targetRef.current = selectedNode;
    }
  }, [selectedId, figureHtml]);

  if (error) {
    return <div className="p-6 text-red-600">{error}</div>;
  }
  if (!annotation) {
    return <div className="p-6">読み込み中…</div>;
  }

  const selected = annotation.objects.find((obj) => obj.id === selectedId) ?? null;

  const updateObject = (objectId: string, updater: (obj: AnnotationObject) => AnnotationObject) => {
    setAnnotation({
      ...annotation,
      objects: annotation.objects.map((obj) => (obj.id === objectId ? updater(obj) : obj)),
    });
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
    setAnnotation({ ...annotation, objects: [...annotation.objects, newObject] });
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
    setAnnotation({ ...annotation, objects: [...annotation.objects, newObject] });
    setSelectedId(id);
  };

  const pctRectFromTarget = (target: HTMLElement | SVGElement) => {
    if (!figureRef.current) {
      return { x: 0, y: 0, w: 10, h: 10 };
    }
    const figureBox = figureRef.current.getBoundingClientRect();
    const targetBox = target.getBoundingClientRect();
    return {
      x: ((targetBox.left - figureBox.left) / figureBox.width) * 100,
      y: ((targetBox.top - figureBox.top) / figureBox.height) * 100,
      w: (targetBox.width / figureBox.width) * 100,
      h: (targetBox.height / figureBox.height) * 100,
    };
  };

  const handleSave = async () => {
    try {
      await saveAnnotation(project, annotationId, annotation);
      setStatus("保存しました");
      setTimeout(() => setStatus(""), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    }
  };

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
      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-1 overflow-auto p-6">
          <div
            ref={figureRef}
            className="mm-editor-figure relative mx-auto"
            style={{ maxWidth: annotation.canvas.width }}
            dangerouslySetInnerHTML={{ __html: figureHtml }}
            onClick={(event) => {
              const target = (event.target as HTMLElement).closest<HTMLElement>("[data-mm-id]");
              setSelectedId(target?.dataset.mmId ?? null);
            }}
          />
          {selected?.type === "frame" && targetRef.current && figureRef.current ? (
            <Moveable
              target={targetRef.current}
              draggable
              resizable
              throttleDrag={0}
              throttleResize={0}
              onDrag={({ target, left, top }) => {
                target.style.left = `${left}px`;
                target.style.top = `${top}px`;
              }}
              onDragEnd={({ target }) => {
                const rect = pctRectFromTarget(target as HTMLElement);
                updateObject(selected.id, (obj) => {
                  if (obj.type !== "frame") {
                    return obj;
                  }
                  return { ...obj, rect };
                });
              }}
              onResize={({ target, width, height, drag }) => {
                target.style.width = `${width}px`;
                target.style.height = `${height}px`;
                target.style.left = `${drag.left}px`;
                target.style.top = `${drag.top}px`;
              }}
              onResizeEnd={({ target }) => {
                const rect = pctRectFromTarget(target as HTMLElement);
                updateObject(selected.id, (obj) => {
                  if (obj.type !== "frame") {
                    return obj;
                  }
                  return { ...obj, rect };
                });
              }}
            />
          ) : null}
        </div>
        <aside className="w-72 shrink-0 overflow-y-auto border-l border-slate-200 bg-slate-50 p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">プロパティ</h2>
          {!selected ? (
            <p className="text-sm text-slate-500">
              キャンバス上のオブジェクトをクリックして選択してください。位置はドラッグ、枠はハンドルでリサイズできます。
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
              <span className="mt-1 block text-xs text-slate-500">
                キャンバス上では直接入力できません。ここで編集して「保存」を押してください。
              </span>
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
            <p className="text-sm text-slate-500">枠の位置・サイズはキャンバス上でドラッグ／リサイズしてください。</p>
          ) : null}
          {selected?.type === "line" || selected?.type === "arrow" ? (
            <p className="text-sm text-slate-500">
              線・矢印は Delete キーで削除できます。点の編集は未対応のため、JSON を直接編集するか CLI / MCP
              から変更してください。
            </p>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
