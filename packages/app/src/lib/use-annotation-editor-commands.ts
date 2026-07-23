import { useEffect } from "react";
import type { MutableRefObject } from "react";
import { applyObjectStyle, extractObjectStyle } from "@mahomanual/core/annotation-defaults";
import { isEditable } from "@mahomanual/core/annotation-objects";
import type { AnnotationFile } from "@mahomanual/core/schema";
import { classifyEditorKeydown } from "./editor-keyboard.js";
import { duplicateObjects, removeUnlockedObjects, reorderObject } from "./annotation-operations.js";
import type { EditorTool } from "../components/annotation-editor/editor-tool.js";

interface UseAnnotationEditorCommandsOptions {
  annotationRef: MutableRefObject<AnnotationFile | null>;
  applyLocalChange: (updater: (current: AnnotationFile) => AnnotationFile) => void;
  nudgeSelection: (selectedIds: readonly string[], dx: number, dy: number) => void;
  activeTool: EditorTool;
  selectedIds: string[];
  setSelectedIds: (updater: string[] | ((ids: string[]) => string[])) => void;
  selectedId: string | null;
  copiedIdsRef: MutableRefObject<string[]>;
  copiedStyleRef: MutableRefObject<ReturnType<typeof extractObjectStyle> | null>;
  presentation: "page" | "modal";
  visualCropActive: boolean;
  onDismiss: () => void;
  onSave: () => void;
  onSpaceDown: () => void;
  onSpaceUp: () => void;
  onFit: () => void;
  onActualSize: () => void;
  onCropCancel: () => void;
  onCropCommit: () => void;
  onFinishLine: () => void;
  onCancelCreation: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

/**
 * 注釈エディタのグローバル keydown/keyup をコマンドへ分類して処理する。
 * 分類自体は classifyEditorKeydown に閉じ、ここでは副作用の実行のみを担う。
 */
export function useAnnotationEditorCommands({
  annotationRef,
  applyLocalChange,
  nudgeSelection,
  activeTool,
  selectedIds,
  setSelectedIds,
  selectedId,
  copiedIdsRef,
  copiedStyleRef,
  presentation,
  visualCropActive,
  onDismiss,
  onSave,
  onSpaceDown,
  onSpaceUp,
  onFit,
  onActualSize,
  onCropCancel,
  onCropCommit,
  onFinishLine,
  onCancelCreation,
  onUndo,
  onRedo,
}: UseAnnotationEditorCommandsOptions) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!annotationRef.current) {
        return;
      }
      const active = document.activeElement;
      const isTextInput = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
      const command = classifyEditorKeydown(event, {
        isTextInput,
        cropEditActive: visualCropActive,
        lineToolActive: activeTool === "line" || activeTool === "arrow",
        hasSelection: selectedIds.length > 0,
        hasCopiedIds: copiedIdsRef.current.length > 0,
        hasCopiedStyle: !!copiedStyleRef.current,
        hasSelectedId: !!selectedId,
        allowDismiss: presentation === "modal",
      });

      switch (command.kind) {
        case "none":
          return;
        case "dismiss":
          event.preventDefault();
          onDismiss();
          return;
        case "save":
          event.preventDefault();
          onSave();
          return;
        case "space-down":
          event.preventDefault();
          onSpaceDown();
          return;
        case "fit":
          event.preventDefault();
          onFit();
          return;
        case "actual-size":
          event.preventDefault();
          onActualSize();
          return;
        case "crop-cancel":
          event.preventDefault();
          onCropCancel();
          return;
        case "crop-commit":
          event.preventDefault();
          onCropCommit();
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
          onFinishLine();
          return;
        case "cancel-creation":
          event.preventDefault();
          onCancelCreation();
          return;
        case "undo":
          event.preventDefault();
          onUndo();
          return;
        case "redo":
          event.preventDefault();
          onRedo();
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
      onSpaceUp();
    };
    window.addEventListener("keydown", handler);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [
    activeTool,
    onFinishLine,
    selectedIds,
    selectedId,
    visualCropActive,
    onCropCancel,
    onCropCommit,
    presentation,
    onDismiss,
  ]);
}
