import { useRef, useState } from "react";
import {
  editableRect,
  hasEditableRect,
  isEditable,
  isLineObject,
  setTextBoxRect,
  taggableObjectsInDisplayOrder,
  textBoxRect,
  textBoxRectFromTopLeft,
} from "@mahomanual/core/annotation-objects";
import { rectAtPixelSize } from "@mahomanual/core/object-geometry";
import {
  applyObjectStyle,
  extractObjectStyle,
  resolveCreationDefaults,
  type AnnotationDefaults,
} from "@mahomanual/core/annotation-defaults";
import { createObjectId, nextBadgeNumber } from "@mahomanual/core/annotation-ids";
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
  replaceAnnotationImage,
  renameAnnotation,
  saveProjectTheme,
} from "../lib/api.js";
import { injectObjectIds, rewriteFigureHtml } from "../lib/figure-html.js";
import { moveItem } from "../lib/collection.js";
import type { PointPct, RectPct } from "../lib/geometry.js";
import {
  alignObjects,
  distributeObjects,
  reorderObject,
} from "../lib/annotation-operations.js";
import { resolveAnnotationNeighbors } from "../lib/annotation-navigation.js";
import { loadRecentStyle, saveRecentStyle } from "../lib/recent-style.js";
import { stepZoom } from "../lib/annotation-viewport.js";
import { roundCreationPct } from "../lib/creation-geometry.js";
import { useAnnotationDocument } from "../lib/use-annotation-document.js";
import { useVisualCropEdit } from "../lib/use-visual-crop-edit.js";
import { useEditorViewport } from "../lib/use-editor-viewport.js";
import { useAnnotationSync } from "../lib/use-annotation-sync.js";
import { useCanvasInteraction } from "../lib/use-canvas-interaction.js";
import { useAnnotationEditorCommands } from "../lib/use-annotation-editor-commands.js";
import { measureTextBoxContentHeightPct } from "../lib/fit-text-box-height.js";
import { AnnotationObjectList } from "./annotation-editor/AnnotationObjectList.js";
import { AnnotationProperties } from "./annotation-editor/AnnotationProperties.js";
import { AlignmentToolbar } from "./annotation-editor/AlignmentToolbar.js";
import { CanvasMarginPanel } from "./annotation-editor/CanvasMarginPanel.js";
import { ImageFilePickerModal } from "./annotation-editor/ImageFilePickerModal.js";
import { VisualCropOverlay } from "./annotation-editor/VisualCropOverlay.js";
import { CropEditBanner, CropEditSideHint } from "./annotation-editor/CropEditBanner.js";
import { AnnotationEditorHeader } from "./annotation-editor/AnnotationEditorHeader.js";
import { AnnotationEditorBanners } from "./annotation-editor/AnnotationEditorBanners.js";
import { AnnotationToolRail } from "./annotation-editor/AnnotationToolRail.js";
import { AnnotationZoomControls } from "./annotation-editor/AnnotationZoomControls.js";
import { AnnotationCanvasOverlays } from "./annotation-editor/AnnotationCanvasOverlays.js";
import { readImageFile } from "./annotation-editor/helpers.js";
import type { EditorTool, RectCreationTool } from "./annotation-editor/editor-tool.js";

interface AnnotationEditorProps {
  project: string;
  annotationId: string;
  onBack?: () => void;
  onRenamed?: (id: string) => void;
  onNavigateToAnnotation?: (id: string) => void;
  presentation?: "page" | "modal";
  onSaved?: () => void;
  hostMarkdownDirty?: boolean;
}

export function AnnotationEditor({
  project,
  annotationId,
  onBack,
  onRenamed,
  onNavigateToAnnotation,
  presentation = "page",
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
    nudgeLinePoints,
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [status, setStatus] = useState<string>("");
  const [nextAnnotationId, setNextAnnotationId] = useState(annotationId);
  const [error, setError] = useState<string>("");
  const [activeTool, setActiveTool] = useState<EditorTool>("select");
  const [marginDraft, setMarginDraft] = useState({ top: 0, right: 0, bottom: 0, left: 0 });
  // オブジェクト一覧の D&D 並べ替え(表示 index = 前面から)
  const [dragListIndex, setDragListIndex] = useState<number | null>(null);
  const [dropListIndex, setDropListIndex] = useState<number | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [soloId, setSoloId] = useState<string | null>(null);
  const [imagePickerMode, setImagePickerMode] = useState<"add" | "replace" | null>(null);
  const figureRef = useRef<HTMLDivElement>(null);
  const copiedIdsRef = useRef<string[]>([]);
  const copiedStyleRef = useRef<ReturnType<typeof extractObjectStyle> | null>(null);
  const selectedId = selectedIds.at(-1) ?? null;

  const onCropOpened = (imageId: string) => {
    setSelectedIds([imageId]);
  };
  const visualCrop = useVisualCropEdit({
    getAnnotation: () => annotationRef.current,
    naturalSizes,
    applyTransientChange,
    commitTransientChange,
    onOpened: onCropOpened,
  });

  const viewport = useEditorViewport({ annotation, annotationId });

  const canvasInteraction = useCanvasInteraction({
    activeTool,
    selectedIds,
    setSelectedIds,
    selectedId,
    zoom: viewport.zoom,
    figureRef,
    wrapRef: viewport.wrapRef,
    canvasViewportRef: viewport.canvasViewportRef,
    spaceHeldRef: viewport.spaceHeldRef,
    setIsPanning: viewport.setIsPanning,
    setViewportZoom: viewport.setViewportZoom,
    annotationRef,
    applyLocalChange,
    visualCropActive: visualCrop.active,
    onOpenVisualCrop: visualCrop.open,
    onCreatePoint: (type, at) => createPointObject(type, at),
    onCreateRect: (type, rect) => createRectObject(type, rect),
    onResetActiveTool: () => setActiveTool("select"),
  });

  const figureHtml = (() => {
    if (!annotation) {
      return "";
    }
    const renderedAnnotation = canvasInteraction.interactionObjects
      ? { ...annotation, objects: canvasInteraction.interactionObjects }
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
  })();

  const showStatus = (message: string) => {
    setStatus(message);
    setTimeout(() => setStatus(""), 2000);
  };

  const resetCreation = () => {
    setActiveTool("select");
    canvasInteraction.resetDrafts();
  };

  const activateTool = (tool: EditorTool) => {
    setActiveTool(tool);
    canvasInteraction.resetDrafts();
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

  const createRectObject = (type: RectCreationTool, rect: RectPct) => {
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

  const sync = useAnnotationSync({
    project,
    annotationId,
    annotationRef,
    dirtyRef,
    replaceDocument,
    markSaved,
    getSavedBase,
    isSameAsCurrent,
    onBack,
    onNavigateToAnnotation,
    onSaved,
    resetOnLoad: () => {
      setNextAnnotationId(annotationId);
      viewport.resetForLoad();
      resetCreation();
      setHiddenIds(new Set());
      setSoloId(null);
    },
    onPayloadApplied: (payload) => {
      setNaturalSizes(payload.naturalSizes);
      setTheme(payload.theme ?? {});
      setAnnotationDefaults(payload.defaults ?? {});
    },
    onError: setError,
    onStatus: showStatus,
  });

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

  const neighbors = resolveAnnotationNeighbors(sync.annotationIds, annotationId);

  useAnnotationEditorCommands({
    annotationRef,
    applyLocalChange,
    nudgeSelection,
    nudgeLinePoints,
    activeTool,
    selectedIds,
    setSelectedIds,
    selectedId,
    selectedPointIndices: canvasInteraction.selectedPointIndices,
    setSelectedPointIndices: canvasInteraction.setSelectedPointIndices,
    copiedIdsRef,
    copiedStyleRef,
    presentation,
    visualCropActive: visualCrop.active,
    onDismiss: () => sync.requestNavigation("back"),
    onSave: () => void sync.handleSave(),
    onSpaceDown: () => viewport.setSpaceHeld(true),
    onSpaceUp: () => {
      viewport.setSpaceHeld(false);
      viewport.setIsPanning(false);
    },
    onFit: viewport.showFit,
    onActualSize: viewport.showActualSize,
    onCropCancel: visualCrop.cancel,
    onCropCommit: visualCrop.commit,
    onFinishLine: canvasInteraction.finishLineDraft,
    onCancelCreation: resetCreation,
    onUndo: undo,
    onRedo: redo,
  });

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
      showStatus(message);
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
    showStatus("テキストボックスの高さを調整しました");
  };

  const toggleObjectLock = (objectId: string) => {
    applyLocalChange((current) => ({
      ...current,
      objects: current.objects.map((obj) =>
        obj.id === objectId ? { ...obj, locked: !obj.locked } : obj,
      ),
    }));
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
      sync.applyPayload({ ...payload, theme });
      if (wasUnlocked) {
        applyLocalChange((current) => ({
          ...current,
          objects: current.objects.map((obj) =>
            obj.id === objectId && obj.type === "image" ? { ...obj, locked: false } : obj,
          ),
        }));
      }
      setSelectedIds([objectId]);
      showStatus("画像を置換しました");
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
      sync.applyPayload({ ...payload, theme });
      setSelectedIds([objectId]);
      showStatus("画像を追加しました");
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

  const interactionSelected = canvasInteraction.interactionObjects?.find((obj) => obj.id === selectedId) ?? selected;
  const activeFrameRect = interactionSelected && isEditable(interactionSelected) && hasEditableRect(interactionSelected)
    ? editableRect(interactionSelected)
    : null;
  const activeLinePoints =
    interactionSelected && isEditable(interactionSelected) && isLineObject(interactionSelected)
      ? interactionSelected.points
      : null;

  const toolClass = (tool: EditorTool) => activeTool === tool
    ? "annotation-tool bg-blue-600 text-white hover:bg-blue-700 hover:text-white"
    : "annotation-tool";
  const previewLinePoints = canvasInteraction.lineDraft
    ? [...canvasInteraction.lineDraft.points, ...(canvasInteraction.hoverPoint ? [canvasInteraction.hoverPoint] : [])]
    : [];
  const previewPoint = activeTool === "badge" || activeTool === "text" || activeTool === "cursor"
    ? canvasInteraction.hoverPoint
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
      data-testid={viewport.viewportReady ? "annotation-editor" : undefined}
    >
      <style>{THEME_FIGURE_CSS}</style>
      {annotationThemeCss(theme) ? <style>{annotationThemeCss(theme)}</style> : null}
      <AnnotationEditorHeader
        presentation={presentation}
        project={project}
        annotationId={annotationId}
        neighbors={neighbors}
        nextAnnotationId={nextAnnotationId}
        onNextAnnotationIdChange={setNextAnnotationId}
        dirty={dirty}
        hostMarkdownDirty={hostMarkdownDirty}
        canUndo={canUndo}
        canRedo={canRedo}
        onRequestNavigation={sync.requestNavigation}
        onRename={() => void handleRename()}
        onUndo={undo}
        onRedo={redo}
        onSave={() => void sync.handleSave()}
      />
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <AnnotationEditorBanners
          status={status}
          hasExternalPayload={sync.externalPayload !== null}
          onApplyExternal={() => {
            if (sync.externalPayload) {
              sync.applyPayload(sync.externalPayload);
            }
          }}
          onDismissExternal={() => sync.setExternalPayload(null)}
          pendingNavigation={sync.pendingNavigation}
          onSaveAndNavigate={() => void sync.completePendingNavigation("save")}
          onDiscardAndNavigate={() => void sync.completePendingNavigation("discard")}
          onCancelNavigation={() => sync.setPendingNavigation(null)}
          mergeConflicts={sync.mergeConflicts}
          mergeResolutions={sync.mergeResolutions}
          onMergeResolutionChange={(id, choice) =>
            sync.setMergeResolutions((current) => ({ ...current, [id]: choice }))
          }
          onApplyMerge={sync.applyMergeResolution}
          onKeepLocalMerge={sync.keepLocalMerge}
        />
        <AnnotationToolRail
          activeTool={activeTool}
          toolClass={toolClass}
          onActivateTool={activateTool}
          onAddImage={() => setImagePickerMode("add")}
        />
        <div
          ref={viewport.canvasViewportRef}
          data-testid="canvas-viewport"
          data-zoom-mode={viewport.zoomMode}
          className="editor-canvas relative flex-1 overflow-auto"
          style={{ cursor: viewport.isPanning ? "grabbing" : viewport.isSpaceHeld ? "grab" : undefined }}
          onWheel={canvasInteraction.handleCanvasWheel}
          onPointerDownCapture={canvasInteraction.handleViewportPointerDownCapture}
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
              ref={viewport.wrapRef}
              data-editor-canvas
              className="relative shrink-0 bg-white shadow-md ring-1 ring-slate-900/10"
              style={{
                width: annotation.canvas.width * viewport.zoom / 100,
                maxWidth: "none",
                aspectRatio: `${annotation.canvas.width} / ${annotation.canvas.height}`,
              }}
              onPointerDown={canvasInteraction.handleFigurePointerDown}
              onPointerMove={canvasInteraction.handleCanvasPointerMove}
              onPointerLeave={() => canvasInteraction.setHoverPoint(null)}
              onClick={canvasInteraction.handleCanvasClick}
              onDoubleClick={canvasInteraction.handleCanvasDoubleClick}
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
              <AnnotationCanvasOverlays
                annotation={annotation}
                activeTool={activeTool}
                activeFrameRect={activeFrameRect}
                activeLinePoints={activeLinePoints}
                selectedPointIndices={canvasInteraction.selectedPointIndices}
                previewPoint={previewPoint}
                rectDraft={canvasInteraction.rectDraft}
                previewLinePoints={previewLinePoints}
                marqueeDraft={canvasInteraction.marqueeDraft}
                snapGuides={canvasInteraction.snapGuides}
                inlineTextEdit={canvasInteraction.inlineTextEdit}
                onBeginRectResize={canvasInteraction.beginRectResize}
                onBeginPointDrag={canvasInteraction.beginPointDrag}
                onInlineTextEditChange={canvasInteraction.setInlineTextEdit}
                updateObject={updateObject}
              />
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
        <AnnotationZoomControls
          zoom={viewport.zoom}
          onZoomOut={() => viewport.setViewportZoom(stepZoom(viewport.zoom, -1), "manual")}
          onZoomIn={() => viewport.setViewportZoom(stepZoom(viewport.zoom, 1), "manual")}
          onShowActualSize={viewport.showActualSize}
          onShowFit={viewport.showFit}
        />
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
              selectedPointIndices={canvasInteraction.selectedPointIndices}
              setSelectedPointIndices={canvasInteraction.setSelectedPointIndices}
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
