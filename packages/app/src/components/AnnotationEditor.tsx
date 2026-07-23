import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  normalizeTextBoxes,
  setTextBoxRect,
  taggableObjectsInDisplayOrder,
  textBoxRect,
  textBoxRectFromTopLeft,
  withEditableRect,
} from "@mahomanual/core/annotation-objects";
import type { SnapGuide } from "@mahomanual/core/object-geometry";
import { rectAtPixelSize } from "@mahomanual/core/object-geometry";
import {
  applyObjectStyle,
  copyObjectStyle,
  extractObjectStyle,
  resolveCreationDefaults,
  type AnnotationDefaults,
} from "@mahomanual/core/annotation-defaults";
import { mergeAnnotationEdits, resolveConflicts, type ObjectConflict } from "@mahomanual/core/merge-annotation-edits";
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
  saveProjectTheme,
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
  duplicateObjects,
  removeUnlockedObjects,
  translateObjects,
  alignObjects,
  distributeObjects,
  objectsInRect,
  reorderObject,
  snapThresholdPct,
} from "../lib/annotation-operations.js";
import { resolveAnnotationNeighbors } from "../lib/annotation-navigation.js";
import { loadRecentStyle, saveRecentStyle } from "../lib/recent-style.js";
import {
  fitCanvasZoom,
  stepZoom,
} from "../lib/annotation-viewport.js";
import {
  classifySelectPointerGesture,
  resolveCanvasObjectElement,
  resolveCanvasObjectTargets,
} from "../lib/canvas-hit-test.js";
import {
  nextSelectionIds,
  prepareObjectDragSession,
  type PreparedObjectDragSession,
} from "../lib/object-drag-session.js";
import {
  commitTranslateDrag,
  previewTranslateDrag,
} from "../lib/object-translate-drag.js";
import { useAnnotationDocument } from "../lib/use-annotation-document.js";
import { useVisualCropEdit } from "../lib/use-visual-crop-edit.js";
import { classifyEditorKeydown } from "../lib/editor-keyboard.js";
import { measureTextBoxContentHeightPct } from "../lib/fit-text-box-height.js";
import {
  classifyTextPointerDown,
  rememberTextPointerClick,
  type TextPointerClickMemory,
} from "../lib/text-edit-gesture.js";
import type { PointPct } from "../lib/geometry.js";
import { BackToProjectButton } from "./BackToProjectButton.js";
import {
  IconArrowLine,
  IconBadge,
  IconChevronRight,
  IconDownload,
  IconFrame,
  IconImage,
  IconLine,
  IconFit,
  IconMinus,
  IconMosaic,
  IconPointer,
  IconPlus,
  IconRedo,
  IconSelect,
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
import { AlignmentToolbar } from "./annotation-editor/AlignmentToolbar.js";
import { CanvasMarginPanel } from "./annotation-editor/CanvasMarginPanel.js";
import { ImageFilePickerModal } from "./annotation-editor/ImageFilePickerModal.js";
import { VisualCropOverlay } from "./annotation-editor/VisualCropOverlay.js";
import { CropEditBanner, CropEditSideHint } from "./annotation-editor/CropEditBanner.js";
import { MergeConflictResolver } from "./annotation-editor/MergeConflictResolver.js";
import {
  FRAME_HANDLES,
  readImageFile,
} from "./annotation-editor/helpers.js";
import {
  allowsObjectDrag,
  isEditingPlacedBadge,
  isRectCreationTool,
  type EditorTool,
  type RectCreationTool,
} from "./annotation-editor/editor-tool.js";

// 点ドラッグ時に他の点の x/y へ吸着する距離(%)。
// 解除距離を大きくする(ヒステリシス)ことで吸着⇄解除のフリッカーを防ぐ
const SNAP_THRESHOLD_PCT = 0.7;
const SNAP_RELEASE_PCT = 1.5;
// 表示倍率により1画面pxが0.1%以上になる場合も、クリック位置を安定した値へ揃える。
const roundCreationPct = (value: number) => Math.round(value * 2) / 2;

interface AnnotationEditorProps {
  project: string;
  annotationId: string;
  onBack?: () => void;
  onRenamed?: (id: string) => void;
  onNavigateToAnnotation?: (id: string) => void;
  presentation?: "page" | "modal";
  onClose?: () => void;
  onSaved?: () => void;
  hostMarkdownDirty?: boolean;
}

interface AnnotationPayload {
  annotation: AnnotationFile;
  naturalSizes: Record<string, { w: number; h: number }>;
  theme?: AnnotationTheme;
  defaults?: AnnotationDefaults;
}

export function AnnotationEditor({
  project,
  annotationId,
  onBack,
  onRenamed,
  onNavigateToAnnotation,
  presentation = "page",
  onClose,
  onSaved,
  hostMarkdownDirty,
}: AnnotationEditorProps) {
  const {
    annotation,
    annotationRef,
    dirty,
    dirtyRef,
    canUndo,
    canRedo,
    applyLocalChange,
    applyTransientChange,
    commitTransientChange,
    nudgeSelection,
    undo: undoDocument,
    redo: redoDocument,
    replaceDocument,
    markSaved,
    getSavedBase,
    isSameAsCurrent,
  } = useAnnotationDocument();
  const [naturalSizes, setNaturalSizes] = useState<Record<string, { w: number; h: number }>>({});
  const [theme, setTheme] = useState<AnnotationTheme>({});
  const [annotationDefaults, setAnnotationDefaults] = useState<AnnotationDefaults>({});
  const [annotationIds, setAnnotationIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);
  const [status, setStatus] = useState<string>("");
  const [nextAnnotationId, setNextAnnotationId] = useState(annotationId);
  const [error, setError] = useState<string>("");
  const [interactionObjects, setInteractionObjects] = useState<AnnotationObject[] | null>(null);
  const [activeTool, setActiveTool] = useState<EditorTool>("select");
  const [hoverPoint, setHoverPoint] = useState<PointPct | null>(null);
  const [rectDraft, setRectDraft] = useState<{ type: "frame" | "mosaic"; rect: RectPct } | null>(null);
  const [lineDraft, setLineDraft] = useState<{ type: "line" | "arrow"; points: PointPct[] } | null>(null);
  const [zoom, setZoom] = useState(25);
  const [zoomMode, setZoomMode] = useState<"fit" | "manual">("fit");
  const [isSpaceHeld, setIsSpaceHeld] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [viewportReady, setViewportReady] = useState(false);
  const [marginDraft, setMarginDraft] = useState({ top: 0, right: 0, bottom: 0, left: 0 });
  // オブジェクト一覧の D&D 並べ替え(表示 index = 前面から)
  const [dragListIndex, setDragListIndex] = useState<number | null>(null);
  const [dropListIndex, setDropListIndex] = useState<number | null>(null);
  // 未保存編集中に外部(AI/CLI)からの変更を検知したとき、上書きせず退避して確認を挟む
  const [externalPayload, setExternalPayload] = useState<AnnotationPayload | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const figureRef = useRef<HTMLDivElement>(null);
  const canvasViewportRef = useRef<HTMLDivElement>(null);
  const copiedIdsRef = useRef<string[]>([]);
  const spaceHeldRef = useRef(false);
  const [imagePickerMode, setImagePickerMode] = useState<"add" | "replace" | null>(null);
  const [marqueeDraft, setMarqueeDraft] = useState<RectPct | null>(null);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [soloId, setSoloId] = useState<string | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<string | "back" | null>(null);
  const [inlineTextEdit, setInlineTextEdit] = useState<{ id: string; value: string } | null>(null);
  const [mergeConflicts, setMergeConflicts] = useState<ObjectConflict[]>([]);
  const [mergeResolutions, setMergeResolutions] = useState<Record<string, "local" | "remote">>({});
  const [mergeContext, setMergeContext] = useState<{
    local: AnnotationFile;
    remote: AnnotationFile;
    merged: AnnotationFile;
  } | null>(null);
  const marqueeJustFinishedRef = useRef(false);
  const lastTextPointerClickRef = useRef<TextPointerClickMemory | null>(null);
  const copiedStyleRef = useRef<ReturnType<typeof extractObjectStyle> | null>(null);
  const selectedId = selectedIds.at(-1) ?? null;
  const onCropOpened = useCallback((imageId: string) => {
    setSelectedIds([imageId]);
  }, []);
  const visualCrop = useVisualCropEdit({
    getAnnotation: () => annotationRef.current,
    naturalSizes,
    applyTransientChange,
    commitTransientChange,
    onOpened: onCropOpened,
  });

  const figureHtml = useMemo(() => {
    if (!annotation) {
      return "";
    }
    const renderedAnnotation = interactionObjects
      ? { ...annotation, objects: interactionObjects }
      : annotation;
    const visibleObjects = (() => {
      let objects = renderedAnnotation.objects;
      if (soloId) {
        return objects.filter((obj) => obj.id === soloId);
      }
      if (hiddenIds.size > 0) {
        return objects.filter((obj) => !hiddenIds.has(obj.id));
      }
      return objects;
    })();
    return injectObjectIds(
      rewriteFigureHtml(
        renderFigure({ ...renderedAnnotation, objects: visibleObjects }, {
          naturalSizes,
          fence: { width: annotation.canvas.width },
        }),
        project,
      ),
      taggableObjectsInDisplayOrder(visibleObjects),
      new Set(selectedIds),
    );
  }, [annotation, interactionObjects, naturalSizes, project, hiddenIds, soloId, selectedIds]);

  const fetchPayload = async (): Promise<AnnotationPayload> => {
    const response = await fetch(
      `/api/projects/${encodeURIComponent(project)}/annotations/${encodeURIComponent(annotationId)}`,
    );
    if (!response.ok) {
      throw new Error("注釈の読み込みに失敗しました");
    }
    const payload = (await response.json()) as AnnotationPayload;
    return { ...payload, annotation: normalizeTextBoxes(payload.annotation) };
  };

  const applyPayload = (payload: AnnotationPayload) => {
    const normalized = normalizeTextBoxes(payload.annotation);
    replaceDocument(normalized, {
      savedSnapshot: normalized,
      dirty: false,
      clearHistory: true,
    });
    setNaturalSizes(payload.naturalSizes);
    setTheme(payload.theme ?? {});
    setAnnotationDefaults(payload.defaults ?? {});
    setExternalPayload(null);
  };

  const syncSelectionToAnnotation = (next: AnnotationFile) => {
    setSelectedIds((ids) =>
      ids.filter((id) => next.objects.some((object) => object.id === id)),
    );
  };

  const undo = () => {
    const previous = undoDocument();
    if (previous) {
      syncSelectionToAnnotation(previous);
    }
  };

  const redo = () => {
    const next = redoDocument();
    if (next) {
      syncSelectionToAnnotation(next);
    }
  };

  const neighbors = resolveAnnotationNeighbors(annotationIds, annotationId);

  const requestNavigation = (target: string | "back") => {
    if (dirtyRef.current) {
      setPendingNavigation(target);
      return;
    }
    if (target === "back") {
      if (presentation === "modal") {
        onClose?.();
      } else {
        onBack?.();
      }
      return;
    }
    onNavigateToAnnotation?.(target);
  };

  const completePendingNavigation = async (mode: "save" | "discard") => {
    const target = pendingNavigation;
    if (!target) {
      return;
    }
    if (mode === "save") {
      await handleSave();
      if (dirtyRef.current) {
        return;
      }
    } else {
      void fetchPayload().then(applyPayload);
    }
    setPendingNavigation(null);
    if (target === "back") {
      if (presentation === "modal") {
        onClose?.();
      } else {
        onBack?.();
      }
    } else {
      onNavigateToAnnotation?.(target);
    }
  };

  const applyMergeResolution = () => {
    if (!mergeContext) {
      return;
    }
    const resolved = resolveConflicts(mergeContext.merged, mergeResolutions, {
      local: mergeContext.local,
      remote: mergeContext.remote,
    });
    replaceDocument(resolved, {
      savedSnapshot: mergeContext.remote,
      dirty: true,
      clearHistory: true,
    });
    setMergeConflicts([]);
    setMergeContext(null);
    setMergeResolutions({});
  };

  const keepLocalMerge = () => {
    setMergeConflicts([]);
    setMergeContext(null);
    setMergeResolutions({});
  };

  const handleSave = async () => {
    const current = annotationRef.current;
    if (!current) {
      return;
    }
    try {
      const saved = await saveAnnotation(project, annotationId, current);
      // サーバーで zod 正規化された内容を保持し、保存エコーの同一判定を確実にする
      markSaved(saved.annotation);
      setStatus("保存しました");
      setTimeout(() => setStatus(""), 2000);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    }
  };

  const resetCreation = () => {
    setActiveTool("select");
    setRectDraft(null);
    setLineDraft(null);
    setHoverPoint(null);
  };

  const activateTool = (tool: EditorTool) => {
    setActiveTool(tool);
    setRectDraft(null);
    setLineDraft(null);
    setHoverPoint(null);
    // モザイクは選択中imageを対象にするため、ツール切替時もその選択だけは保持する。
    if (tool !== "select" && tool !== "mosaic") {
      setSelectedIds([]);
    }
  };

  const buildCreationStyle = (type: AnnotationObject["type"]) =>
    resolveCreationDefaults(type, {
      objectPatch: loadRecentStyle(project, type) ?? undefined,
      projectDefaults: annotationDefaults,
      theme,
    });

  const createPointObject = (type: "badge" | "text" | "cursor", at: PointPct) => {
    const current = annotationRef.current;
    if (!current) {
      return;
    }
    const id = createObjectId(type, current.objects);
    const roundedAt = { x: roundCreationPct(at.x), y: roundCreationPct(at.y) };
    const style = buildCreationStyle(type);
    let object: AnnotationObject;
    if (type === "badge") {
      object = { id, type, source: "manual", n: nextBadgeNumber(current.objects), at: roundedAt, ...style };
    } else if (type === "text") {
      object = {
        ...setTextBoxRect(
          { id, type, source: "manual", content: "テキスト", at: roundedAt },
          textBoxRectFromTopLeft(roundedAt),
        ),
        ...style,
      };
    } else {
      object = { id, type, source: "manual", icon: style.icon ?? "pointer", at: roundedAt, size: style.size ?? 28, ...style };
    }
    applyLocalChange((latest) => ({ ...latest, objects: [...latest.objects, object] }));
    setSelectedIds([id]);
    if (type !== "badge") {
      resetCreation();
    }
  };

  const createRectObject = (type: "frame" | "mosaic", rect: RectPct) => {
    const current = annotationRef.current;
    if (!current) {
      return;
    }
    const id = createObjectId(type, current.objects);
    const style = buildCreationStyle(type);
    let object: AnnotationObject;
    if (type === "frame") {
      object = { id, type, source: "manual", rect, ...style };
    } else {
      const selectedImage = current.objects.find((obj) => obj.id === selectedId && obj.type === "image");
      const target = selectedImage ?? [...current.objects].reverse().find(
        (obj): obj is Extract<AnnotationObject, { type: "image" }> => obj.type === "image",
      );
      if (!target) {
        setStatus("モザイク対象の画像がありません");
        resetCreation();
        return;
      }
      object = {
        id,
        type,
        source: "manual",
        targetImageId: target.id,
        rect,
        blockSize: style.blockSize ?? 12,
      };
    }
    applyLocalChange((latest) => ({ ...latest, objects: [...latest.objects, object] }));
    setSelectedIds([id]);
    resetCreation();
  };

  const finishLineDraft = () => {
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
    resetCreation();
  };

  const setViewportZoom = (
    nextZoom: number,
    mode: "fit" | "manual",
    anchor?: { clientX: number; clientY: number },
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
  };

  const showActualSize = () => setViewportZoom(100, "manual");

  const showFit = () => {
    const viewport = canvasViewportRef.current;
    const current = annotationRef.current;
    if (!viewport || !current) {
      return;
    }
    setViewportZoom(fitCanvasZoom(current.canvas, {
      width: viewport.clientWidth,
      height: viewport.clientHeight,
    }, 64), "fit");
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
    setError("");
    setNextAnnotationId(annotationId);
    setViewportReady(false);
    resetCreation();
    setZoomMode("fit");
    setHiddenIds(new Set());
    setSoloId(null);
    setMergeConflicts([]);
    setMergeContext(null);
    void fetchPayload()
      .then(applyPayload)
      .catch((err: Error) => setError(err.message));
    void fetch(`/api/projects/${encodeURIComponent(project)}/manual`)
      .then((response) => response.json())
      .then((body: { annotations?: string[] }) => setAnnotationIds(body.annotations ?? []))
      .catch(() => setAnnotationIds([]));
  }, [project, annotationId]);

  useEffect(() => {
    setSelectedPointIndex(null);
  }, [selectedId]);

  useEffect(() => {
    if (selectedIds.length === 0) {
      setSnapGuides([]);
    }
  }, [selectedIds]);

  useEffect(() => {
    return subscribeProjectWatch(project, (event) => {
      if (event.path !== `annotations/${annotationId}.json`) {
        return;
      }
      void fetchPayload()
        .then((payload) => {
          // 自分の保存によるエコーは無視する
          if (isSameAsCurrent(payload.annotation)) {
            return;
          }
          if (dirtyRef.current) {
            const base = getSavedBase();
            const local = annotationRef.current;
            if (!local) {
              return;
            }
            const result = mergeAnnotationEdits(base, local, payload.annotation);
            if (result.conflicts.length === 0) {
              replaceDocument(result.merged, {
                savedSnapshot: payload.annotation,
                dirty: true,
                clearHistory: true,
              });
              setExternalPayload(null);
              return;
            }
            setMergeConflicts(result.conflicts);
            setMergeResolutions(Object.fromEntries(
              result.conflicts.map((conflict) => [conflict.id, "local" as const]),
            ));
            setMergeContext({ local, remote: payload.annotation, merged: result.merged });
            setExternalPayload(null);
            return;
          }
          applyPayload(payload);
        })
        .catch((err: Error) => setError(err.message));
    });
  }, [project, annotationId]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
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

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!annotationRef.current) {
        return;
      }
      const active = document.activeElement;
      const isTextInput = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
      const command = classifyEditorKeydown(event, {
        isTextInput,
        cropEditActive: visualCrop.active,
        lineToolActive: activeTool === "line" || activeTool === "arrow",
        hasSelection: selectedIds.length > 0,
        hasCopiedIds: copiedIdsRef.current.length > 0,
        hasCopiedStyle: !!copiedStyleRef.current,
        hasSelectedId: !!selectedId,
      });

      switch (command.kind) {
        case "none":
          if (presentation === "modal" && event.key === "Escape") {
            event.preventDefault();
            requestNavigation("back");
          }
          return;
        case "save":
          event.preventDefault();
          void handleSave();
          return;
        case "space-down":
          event.preventDefault();
          spaceHeldRef.current = true;
          setIsSpaceHeld(true);
          return;
        case "fit":
          event.preventDefault();
          showFit();
          return;
        case "actual-size":
          event.preventDefault();
          showActualSize();
          return;
        case "crop-cancel":
          event.preventDefault();
          visualCrop.cancel();
          return;
        case "crop-commit":
          event.preventDefault();
          visualCrop.commit();
          return;
        case "select-all":
          event.preventDefault();
          setSelectedIds(
            annotationRef.current.objects
              .filter((obj) => isEditable(obj) && obj.type !== "image")
              .map((obj) => obj.id),
          );
          return;
        case "finish-line":
          event.preventDefault();
          finishLineDraft();
          return;
        case "cancel-creation":
          event.preventDefault();
          resetCreation();
          return;
        case "undo":
          event.preventDefault();
          undo();
          return;
        case "redo":
          event.preventDefault();
          redo();
          return;
        case "copy-style": {
          event.preventDefault();
          if (!selectedId) {
            return;
          }
          const obj = annotationRef.current.objects.find((item) => item.id === selectedId);
          if (obj) {
            copiedStyleRef.current = extractObjectStyle(obj);
          }
          return;
        }
        case "paste-style":
          event.preventDefault();
          if (!selectedId || !copiedStyleRef.current) {
            return;
          }
          applyLocalChange((current) => ({
            ...current,
            objects: current.objects.map((obj) =>
              obj.id === selectedId && isEditable(obj)
                ? applyObjectStyle(obj, copiedStyleRef.current!)
                : obj,
            ),
          }));
          return;
        case "reorder":
          event.preventDefault();
          applyLocalChange((current) => ({
            ...current,
            objects: reorderObject(current.objects, selectedIds, command.direction),
          }));
          return;
        case "duplicate": {
          event.preventDefault();
          const result = duplicateObjects(annotationRef.current.objects, selectedIds, 1);
          applyLocalChange((current) => ({ ...current, objects: result.objects }));
          setSelectedIds(result.selectedIds);
          return;
        }
        case "copy":
          event.preventDefault();
          copiedIdsRef.current = [...selectedIds];
          return;
        case "paste": {
          event.preventDefault();
          const result = duplicateObjects(annotationRef.current.objects, copiedIdsRef.current);
          applyLocalChange((current) => ({ ...current, objects: result.objects }));
          setSelectedIds(result.selectedIds);
          copiedIdsRef.current = result.selectedIds;
          return;
        }
        case "delete":
          event.preventDefault();
          applyLocalChange((current) => ({
            ...current,
            objects: removeUnlockedObjects(current.objects, new Set(selectedIds)),
          }));
          setSelectedIds((ids) =>
            ids.filter((id) => {
              const obj = annotationRef.current?.objects.find((item) => item.id === id);
              return obj !== undefined && !isEditable(obj);
            }),
          );
          return;
        case "nudge":
          event.preventDefault();
          nudgeSelection(selectedIds, command.dx, command.dy);
          return;
        default: {
          const _exhaustive: never = command;
          return _exhaustive;
        }
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space") {
        return;
      }
      spaceHeldRef.current = false;
      setIsSpaceHeld(false);
      setIsPanning(false);
    };
    window.addEventListener("keydown", handler);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [activeTool, lineDraft, selectedIds, selectedId, visualCrop.active, visualCrop.cancel, visualCrop.commit]);

  // ポインタ座標 → figure 内の%座標
  const pctFromClient = (clientX: number, clientY: number): PointPct => {
    const figure = figureRef.current?.querySelector("figure");
    const box = figure?.getBoundingClientRect() ?? wrapRef.current?.getBoundingClientRect();
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
  };

  const normalizeDraftRect = (start: PointPct, end: PointPct): RectPct => ({
    x: roundCreationPct(Math.min(start.x, end.x)),
    y: roundCreationPct(Math.min(start.y, end.y)),
    w: roundCreationPct(Math.abs(end.x - start.x)),
    h: roundCreationPct(Math.abs(end.y - start.y)),
  });

  const getSnapThreshold = () => {
    const figure = figureRef.current?.querySelector("figure");
    const box = figure?.getBoundingClientRect();
    if (!box) {
      return SNAP_THRESHOLD_PCT;
    }
    return snapThresholdPct(zoom, box.width, 6);
  };

  const startMarqueeSelection = (event: ReactPointerEvent) => {
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
  };

  const handleCanvasClick = (event: ReactMouseEvent<HTMLDivElement>) => {
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
      createPointObject(activeTool, point);
      return;
    }
    if (activeTool === "line" || activeTool === "arrow") {
      if (event.detail >= 2) {
        finishLineDraft();
        return;
      }
      setLineDraft((current) => current?.type === activeTool
        ? { ...current, points: [...current.points, {
            x: roundCreationPct(point.x),
            y: roundCreationPct(point.y),
          }] }
        : { type: activeTool, points: [{
            x: roundCreationPct(point.x),
            y: roundCreationPct(point.y),
          }] });
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
      setSelectedIds([]);
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
  };

  const handleCanvasDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
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
      visualCrop.open(obj.id);
    }
  };

  const handleCanvasPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const targetId = resolveCanvasObjectElement(event)?.dataset.mmId;
    const editingSelectedBadge = isEditingPlacedBadge(activeTool, targetId, selectedIds);
    if (activeTool !== "select" && event.buttons === 0 && !editingSelectedBadge) {
      setHoverPoint(pctFromClient(event.clientX, event.clientY));
    }
  };

  const handleCanvasWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!event.metaKey && !event.ctrlKey) {
      return;
    }
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    setViewportZoom(stepZoom(zoom, direction), "manual", event);
  };

  const handleViewportPointerDownCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
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
  };

  // figure 上のドラッグはイベント委任で受ける。
  // 要素ごとのリスナー配線は innerHTML 差し替えとのタイミングで外れることが
  // あるため、コンテナ1箇所で受けて常に annotationRef(最新値)から対象を解決する
  const handleRectCreationPointerDown = (event: ReactPointerEvent, type: RectCreationTool) => {
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
          createRectObject(type, rect);
        }
      },
    });
  };

  const handleObjectSelectionPointerDown = (
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

        // line / arrow: Option+クリックで最も近い線分に点を挿入（複製ドラッグとは別経路）
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
  };

  const handleFigurePointerDown = (event: ReactPointerEvent) => {
    const current = annotationRef.current;
    if (!current) {
      return;
    }
    if (visualCrop.active) {
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
  };

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

  const persistProjectDefaults = async (next: AnnotationDefaults, message: string) => {
    try {
      const response = await saveProjectTheme(project, theme, next);
      setAnnotationDefaults(response.defaults ?? next);
      setStatus(message);
      setTimeout(() => setStatus(""), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "既定スタイルの保存に失敗しました");
    }
  };

  const saveSelectedAsProjectDefault = () => {
    if (!selected || selected.type === "image") {
      return;
    }
    const style = resolveCreationDefaults(selected.type, {
      objectPatch: extractObjectStyle(selected),
      projectDefaults: annotationDefaults,
      theme,
    });
    const next = { ...annotationDefaults, [selected.type]: style } as AnnotationDefaults;
    void persistProjectDefaults(next, "プロジェクト既定を保存しました");
  };

  const clearSelectedProjectDefault = () => {
    if (!selected || selected.type === "image") {
      return;
    }
    const next = { ...annotationDefaults };
    delete (next as Record<string, unknown>)[selected.type];
    void persistProjectDefaults(next, "プロジェクト既定を解除しました");
  };

  const applyDefaultsToSelected = () => {
    if (!selected || selected.type === "image" || !isEditable(selected)) {
      return;
    }
    const style = resolveCreationDefaults(selected.type, {
      projectDefaults: annotationDefaults,
      theme,
    });
    applyLocalChange((current) => ({
      ...current,
      objects: current.objects.map((obj) => {
        if (obj.id !== selected.id || !isEditable(obj) || obj.type === "image") {
          return obj;
        }
        const next = applyObjectStyle(obj, style);
        saveRecentStyle(project, next);
        return next;
      }),
    }));
  };

  const resetImageToOriginalSize = () => {
    if (!selected || selected.type !== "image" || !isEditable(selected)) {
      return;
    }
    const natural = naturalSizes[selected.src];
    if (!natural) {
      return;
    }
    const pixelSize = selected.crop
      ? { w: selected.crop.w, h: selected.crop.h }
      : natural;
    applyLocalChange((current) => ({
      ...current,
      objects: current.objects.map((obj) => {
        if (obj.id !== selected.id || obj.type !== "image" || !isEditable(obj)) {
          return obj;
        }
        return {
          ...obj,
          rect: rectAtPixelSize(obj.rect, current.canvas, pixelSize),
        };
      }),
    }));
  };

  const updateObject = (objectId: string, updater: (obj: AnnotationObject) => AnnotationObject) => {
    applyLocalChange((current) => ({
      ...current,
      objects: current.objects.map((obj) => {
        if (obj.id !== objectId || !isEditable(obj)) {
          return obj;
        }
        const next = updater(obj);
        saveRecentStyle(project, next);
        return next;
      }),
    }));
  };

  const fitSelectedTextHeight = () => {
    const current = annotationRef.current;
    const selectedObject = current?.objects.find((obj) => obj.id === selectedId);
    const figure = figureRef.current?.querySelector("figure");
    if (!current || !selectedObject || selectedObject.type !== "text" || !isEditable(selectedObject) || !figure) {
      return;
    }
    const nextHeight = measureTextBoxContentHeightPct(figure, selectedObject.id);
    if (nextHeight === null) {
      return;
    }
    updateObject(selectedObject.id, (obj) =>
      obj.type === "text"
        ? setTextBoxRect(obj, { ...textBoxRect(obj), h: nextHeight })
        : obj,
    );
    setStatus("テキストボックスの高さを調整しました");
    setTimeout(() => setStatus(""), 2000);
  };

  const toggleObjectLock = (objectId: string) => {
    applyLocalChange((current) => ({
      ...current,
      objects: current.objects.map((obj) =>
        obj.id === objectId ? { ...obj, locked: !obj.locked } : obj,
      ),
    }));
  };

  const beginRectResize = (event: ReactPointerEvent, dir: string) => {
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
    const snap = (pointerPct: PointPct, shiftKey: boolean): PointPct => {
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
    const pointsFor = (pct: PointPct): PointPct[] => points0.map((point, i) => (i === index ? pct : point));
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

  const handleReplaceImage = async (file: File) => {
    if (!selected || !isEditable(selected) || selected.type !== "image") {
      return;
    }
    const objectId = selected.id;
    const wasUnlocked = isEditable(selected);
    try {
      const replacement = await readImageFile(file);
      const payload = await replaceAnnotationImage(
        project,
        annotationId,
        objectId,
        replacement.data,
        replacement.width,
        replacement.height,
      );
      applyPayload({ ...payload, theme });
      if (wasUnlocked) {
        applyLocalChange((current) => ({
          ...current,
          objects: current.objects.map((obj) =>
            obj.id === objectId && obj.type === "image" ? { ...obj, locked: false } : obj,
          ),
        }));
      }
      setSelectedIds([objectId]);
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
  const activeFrameRect = interactionSelected && isEditable(interactionSelected) && hasEditableRect(interactionSelected)
    ? editableRect(interactionSelected)
    : null;
  const activeLinePoints =
    interactionSelected && isEditable(interactionSelected) && isLineObject(interactionSelected)
      ? interactionSelected.points
      : null;

  const lineObjects = (interactionObjects ?? annotation.objects).filter(isLineObject);
  const toCanvasPoints = (points: PointPct[]): string =>
    points
      .map(
        (point) =>
          `${(point.x / 100) * annotation.canvas.width},${(point.y / 100) * annotation.canvas.height}`,
      )
      .join(" ");
  const toolClass = (tool: EditorTool) => activeTool === tool
    ? "annotation-tool bg-blue-600 text-white hover:bg-blue-700 hover:text-white"
    : "annotation-tool";
  const previewLinePoints = lineDraft
    ? [...lineDraft.points, ...(hoverPoint ? [hoverPoint] : [])]
    : [];
  const previewPoint = activeTool === "badge" || activeTool === "text" || activeTool === "cursor"
    ? hoverPoint
    : null;
  const cropEditSession = visualCrop.session;
  const cropEditImage = cropEditSession
    ? annotation.objects.find(
        (obj): obj is Extract<AnnotationObject, { type: "image" }> =>
          obj.id === cropEditSession.imageId && obj.type === "image",
      ) ?? null
    : null;

  const applyAlignment = (
    axis: "horizontal" | "vertical",
    edge: "start" | "center" | "end",
  ) => {
    applyLocalChange((current) => ({
      ...current,
      objects: alignObjects(current.objects, selectedIds, axis, edge),
    }));
  };

  const applyDistribution = (axis: "horizontal" | "vertical") => {
    applyLocalChange((current) => ({
      ...current,
      objects: distributeObjects(current.objects, selectedIds, axis),
    }));
  };

  const applyLayerMove = (direction: "forward" | "backward") => {
    applyLocalChange((current) => ({
      ...current,
      objects: reorderObject(current.objects, selectedIds, direction),
    }));
  };

  return (
    <div
      className={presentation === "modal" ? "flex h-full min-h-0 flex-col" : "flex h-screen min-h-0 flex-col"}
      data-testid={viewportReady ? "annotation-editor" : undefined}
    >
      <style>{THEME_FIGURE_CSS}</style>
      {annotationThemeCss(theme) ? <style>{annotationThemeCss(theme)}</style> : null}
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <nav className="flex items-center gap-1" aria-label="注釈ナビゲーション">
          {presentation === "modal" ? (
            <Button
              size="sm"
              variant="ghost"
              data-testid="annotation-modal-close"
              onClick={() => requestNavigation("back")}
            >
              閉じる
            </Button>
          ) : (
            <BackToProjectButton project={project} onClick={() => requestNavigation("back")} />
          )}
          <Separator />
          <Button
            size="sm"
            variant="ghost"
            data-testid="nav-prev-annotation"
            disabled={!neighbors.prev}
            onClick={() => neighbors.prev && requestNavigation(neighbors.prev)}
          >
            <IconChevronRight size={14} className="rotate-180" />
            前の注釈
          </Button>
          <Button
            size="sm"
            variant="ghost"
            data-testid="nav-next-annotation"
            disabled={!neighbors.next}
            onClick={() => neighbors.next && requestNavigation(neighbors.next)}
          >
            次の注釈
            <IconChevronRight size={14} />
          </Button>
        </nav>
        <h1 id="annotation-editor-title" className="min-w-0 truncate text-[15px] font-semibold tracking-tight">
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
            disabled={dirty || hostMarkdownDirty || !nextAnnotationId.trim() || nextAnnotationId.trim() === annotationId}
            title={dirty ? "先に変更を保存してください" : hostMarkdownDirty ? "先にマニュアル本文を保存してください" : "画像IDを変更"}
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
            disabled={!canUndo}
            onClick={undo}
          >
            <IconUndo />
          </IconButton>
          <IconButton
            label="やり直す (⌘⇧Z)"
            data-testid="redo-button"
            disabled={!canRedo}
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
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex flex-col">
          {status ? (
            <div className="pointer-events-auto">
              <Banner kind="success">{status}</Banner>
            </div>
          ) : null}
          {externalPayload ? (
            <div className="pointer-events-auto">
              <Banner kind="warning" testId="external-change-banner">
                <span className="min-w-0 flex-1">
                  外部で注釈が変更されました。読み込むと未保存の編集は失われます。
                </span>
                <Button size="sm" data-testid="apply-external" onClick={() => applyPayload(externalPayload)}>
                  外部の内容を読み込む
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setExternalPayload(null)}>
                  GUIの内容を維持
                </Button>
              </Banner>
            </div>
          ) : null}
          {pendingNavigation ? (
            <div className="pointer-events-auto">
              <Banner kind="warning" testId="unsaved-nav-banner">
                <span className="min-w-0 flex-1">未保存の変更があります。移動方法を選んでください。</span>
                <Button size="sm" data-testid="nav-save-and-go" onClick={() => void completePendingNavigation("save")}>
                  保存して移動
                </Button>
                <Button size="sm" variant="ghost" data-testid="nav-discard-and-go" onClick={() => void completePendingNavigation("discard")}>
                  破棄して移動
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPendingNavigation(null)}>
                  キャンセル
                </Button>
              </Banner>
            </div>
          ) : null}
          {mergeConflicts.length > 0 ? (
            <div className="pointer-events-auto">
              <MergeConflictResolver
                conflicts={mergeConflicts}
                resolutions={mergeResolutions}
                onResolutionChange={(id, choice) => setMergeResolutions((current) => ({ ...current, [id]: choice }))}
                onApply={applyMergeResolution}
                onKeepLocal={keepLocalMerge}
              />
            </div>
          ) : null}
        </div>
        {/* オブジェクト追加ツールレール(キャンバス左端にフロート)。
            ツール名は SPEC の注釈用語に合わせ、CSS ツールチップで表示する */}
        <div className="absolute left-3 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-md">
          <IconButton
            label="選択"
            tip
            data-testid="tool-select"
            aria-pressed={activeTool === "select"}
            className={toolClass("select")}
            onClick={() => activateTool("select")}
          >
            <IconSelect />
          </IconButton>
          <div className="my-0.5 h-px bg-slate-200" aria-hidden="true" />
          <IconButton
            label="丸数字"
            tip
            data-testid="add-badge"
            aria-pressed={activeTool === "badge"}
            className={toolClass("badge")}
            onClick={() => activateTool("badge")}
          >
            <IconBadge />
          </IconButton>
          <IconButton
            label="テキスト"
            tip
            data-testid="add-text"
            aria-pressed={activeTool === "text"}
            className={toolClass("text")}
            onClick={() => activateTool("text")}
          >
            <IconType />
          </IconButton>
          <IconButton
            label="カーソル"
            tip
            data-testid="add-cursor"
            aria-pressed={activeTool === "cursor"}
            className={toolClass("cursor")}
            onClick={() => activateTool("cursor")}
          >
            <IconPointer />
          </IconButton>
          <IconButton
            label="強調枠"
            tip
            data-testid="add-frame"
            aria-pressed={activeTool === "frame"}
            className={toolClass("frame")}
            onClick={() => activateTool("frame")}
          >
            <IconFrame />
          </IconButton>
          <IconButton
            label="罫線"
            tip
            data-testid="add-line"
            aria-pressed={activeTool === "line"}
            className={toolClass("line")}
            onClick={() => activateTool("line")}
          >
            <IconLine />
          </IconButton>
          <IconButton
            label="矢印"
            tip
            data-testid="add-arrow"
            aria-pressed={activeTool === "arrow"}
            className={toolClass("arrow")}
            onClick={() => activateTool("arrow")}
          >
            <IconArrowLine />
          </IconButton>
          <IconButton label="画像" tip data-testid="add-image" onClick={() => setImagePickerMode("add")}>
            <IconImage />
          </IconButton>
          <IconButton
            label="モザイク"
            tip
            data-testid="add-mosaic"
            aria-pressed={activeTool === "mosaic"}
            className={toolClass("mosaic")}
            onClick={() => activateTool("mosaic")}
          >
            <IconMosaic />
          </IconButton>
        </div>
        <div
          ref={canvasViewportRef}
          data-testid="canvas-viewport"
          data-zoom-mode={zoomMode}
          className="editor-canvas relative flex-1 overflow-auto"
          style={{ cursor: isPanning ? "grabbing" : isSpaceHeld ? "grab" : undefined }}
          onWheel={handleCanvasWheel}
          onPointerDownCapture={handleViewportPointerDownCapture}
        >
          {cropEditSession ? (
            <CropEditBanner
              session={cropEditSession}
              onResetFull={visualCrop.resetFull}
              onCancel={visualCrop.cancel}
              onConfirm={visualCrop.commit}
            />
          ) : null}
          <div className="flex min-h-full w-max min-w-full items-center justify-center p-8 pl-16">
            <div
              ref={wrapRef}
              data-editor-canvas
              className="relative shrink-0 bg-white shadow-md ring-1 ring-slate-900/10"
              style={{
                width: annotation.canvas.width * zoom / 100,
                maxWidth: "none",
                aspectRatio: `${annotation.canvas.width} / ${annotation.canvas.height}`,
              }}
              onPointerDown={handleFigurePointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerLeave={() => setHoverPoint(null)}
              onClick={handleCanvasClick}
              onDoubleClick={handleCanvasDoubleClick}
            >
              {selectedIds.length >= 2 && activeTool === "select" ? (
                <AlignmentToolbar
                  onAlign={applyAlignment}
                  onDistribute={applyDistribution}
                  onLayerForward={() => applyLayerMove("forward")}
                  onLayerBackward={() => applyLayerMove("backward")}
                />
              ) : null}
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
                {previewPoint ? (
                  <div
                    data-testid="creation-preview"
                    className={`mm-creation-preview mm-creation-preview--${activeTool}`}
                    style={{ left: `${previewPoint.x}%`, top: `${previewPoint.y}%` }}
                  >
                    {activeTool === "badge"
                      ? nextBadgeNumber(annotation.objects)
                      : activeTool === "text"
                        ? "テキスト"
                        : <IconPointer size={20} />}
                  </div>
                ) : null}
                {rectDraft ? (
                  <div
                    data-testid="creation-preview"
                    className={`mm-creation-preview-rect mm-creation-preview-rect--${rectDraft.type}`}
                    style={{
                      left: `${rectDraft.rect.x}%`,
                      top: `${rectDraft.rect.y}%`,
                      width: `${rectDraft.rect.w}%`,
                      height: `${rectDraft.rect.h}%`,
                    }}
                  />
                ) : null}
                {previewLinePoints.length > 0 ? (
                  <svg
                    data-testid="creation-preview"
                    className="mm-creation-preview-line"
                    viewBox={`0 0 ${annotation.canvas.width} ${annotation.canvas.height}`}
                    preserveAspectRatio="none"
                  >
                    <polyline points={toCanvasPoints(previewLinePoints)} />
                  </svg>
                ) : null}
                {marqueeDraft ? (
                  <div
                    data-testid="marquee-preview"
                    className="mm-marquee-preview"
                    style={{
                      left: `${marqueeDraft.x}%`,
                      top: `${marqueeDraft.y}%`,
                      width: `${marqueeDraft.w}%`,
                      height: `${marqueeDraft.h}%`,
                    }}
                  />
                ) : null}
                {snapGuides.map((guide, index) => (
                  <div
                    key={`${guide.axis}-${guide.value}-${index}`}
                    data-testid={`snap-guide-${guide.axis}`}
                    className={`mm-snap-guide mm-snap-guide--${guide.axis}`}
                    style={guide.axis === "x"
                      ? { left: `${guide.value}%` }
                      : { top: `${guide.value}%` }}
                  />
                ))}
                {inlineTextEdit && (() => {
                  const textObj = annotation.objects.find((obj) => obj.id === inlineTextEdit.id && obj.type === "text");
                  if (!textObj || textObj.type !== "text") {
                    return null;
                  }
                  return (
                    <textarea
                      data-testid="inline-text-editor"
                      className="mm-inline-text-editor"
                      style={textObj.rect
                        ? {
                            left: `${textObj.rect.x}%`,
                            top: `${textObj.rect.y}%`,
                            width: `${textObj.rect.w}%`,
                            height: `${textObj.rect.h}%`,
                          }
                        : { left: `${textObj.at.x}%`, top: `${textObj.at.y}%` }}
                      value={inlineTextEdit.value}
                      autoFocus
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => setInlineTextEdit({ id: inlineTextEdit.id, value: event.target.value })}
                      onBlur={() => {
                        updateObject(inlineTextEdit.id, (obj) =>
                          obj.type === "text" ? { ...obj, content: inlineTextEdit.value } : obj,
                        );
                        setInlineTextEdit(null);
                      }}
                      onKeyDown={(event) => {
                        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                          event.preventDefault();
                          updateObject(inlineTextEdit.id, (obj) =>
                            obj.type === "text" ? { ...obj, content: inlineTextEdit.value } : obj,
                          );
                          setInlineTextEdit(null);
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          setInlineTextEdit(null);
                        }
                      }}
                    />
                  );
                })()}
              </div>
              {cropEditSession && cropEditImage ? (
                <VisualCropOverlay
                  image={cropEditImage}
                  canvas={annotation.canvas}
                  natural={cropEditSession.natural}
                  crop={cropEditSession.crop}
                  onCropChange={visualCrop.setCrop}
                />
              ) : null}
            </div>
          </div>
        </div>
        <div className="absolute bottom-3 left-16 z-10 flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-md">
          <IconButton
            label="縮小"
            size="sm"
            data-testid="zoom-out"
            disabled={zoom <= 25}
            onClick={() => setViewportZoom(stepZoom(zoom, -1), "manual")}
          >
            <IconMinus size={14} />
          </IconButton>
          <output
            data-testid="zoom-value"
            className="w-12 text-center font-mono text-[11px] font-medium text-slate-700"
            aria-label="表示倍率"
          >
            {Math.round(zoom)}%
          </output>
          <IconButton
            label="拡大"
            size="sm"
            data-testid="zoom-in"
            disabled={zoom >= 400}
            onClick={() => setViewportZoom(stepZoom(zoom, 1), "manual")}
          >
            <IconPlus size={14} />
          </IconButton>
          <div className="mx-0.5 h-5 w-px bg-slate-200" aria-hidden="true" />
          <Button size="sm" variant="ghost" data-testid="zoom-actual" onClick={showActualSize}>
            100%
          </Button>
          <IconButton label="全体表示" size="sm" data-testid="zoom-fit" onClick={showFit}>
            <IconFit size={14} />
          </IconButton>
        </div>
        <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-slate-200 bg-white">
          <AnnotationObjectList
            objects={annotation.objects}
            selectedIds={selectedIds}
            hiddenIds={hiddenIds}
            soloId={soloId}
            dragListIndex={dragListIndex}
            dropListIndex={dropListIndex}
            selectionLocked={visualCrop.active}
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
            onToggleHidden={(id) => {
              setHiddenIds((current) => {
                const next = new Set(current);
                if (next.has(id)) {
                  next.delete(id);
                } else {
                  next.add(id);
                }
                return next;
              });
            }}
            onToggleSolo={(id) => {
              setSoloId((current) => (current === id ? null : id));
            }}
            onReorder={reorderByDisplayIndex}
            onDragListIndexChange={setDragListIndex}
            onDropListIndexChange={setDropListIndex}
          />
          <CanvasMarginPanel
            marginDraft={marginDraft}
            onChange={setMarginDraft}
            onApply={applyCanvasMargin}
          />
          {cropEditSession ? (
            <CropEditSideHint session={cropEditSession} />
          ) : (
            <AnnotationProperties
              selected={selected}
              annotation={annotation}
              naturalSizes={naturalSizes}
              theme={theme}
              selectedPointIndex={selectedPointIndex}
              setSelectedPointIndex={setSelectedPointIndex}
              updateObject={updateObject}
              onOpenReplaceImage={() => setImagePickerMode("replace")}
              onOpenVisualCrop={selected?.type === "image" && isEditable(selected)
                ? () => visualCrop.open(selected.id)
                : undefined}
              hasProjectDefault={selected && selected.type !== "image"
                ? annotationDefaults[selected.type as keyof AnnotationDefaults] !== undefined
                : false}
              onSaveProjectDefault={saveSelectedAsProjectDefault}
              onClearProjectDefault={clearSelectedProjectDefault}
              onApplyProjectDefault={applyDefaultsToSelected}
              onResetImageSize={selected?.type === "image" && isEditable(selected)
                ? resetImageToOriginalSize
                : undefined}
              onFitTextHeight={selected?.type === "text" && isEditable(selected)
                ? fitSelectedTextHeight
                : undefined}
            />
          )}
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
