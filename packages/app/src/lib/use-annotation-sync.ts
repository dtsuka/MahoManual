import { useCallback, useEffect, useState } from "react";
import type { MutableRefObject } from "react";
import { normalizeTextBoxes } from "@mahomanual/core/annotation-objects";
import { mergeAnnotationEdits, resolveConflicts, type ObjectConflict } from "@mahomanual/core/merge-annotation-edits";
import type { AnnotationDefaults } from "@mahomanual/core/annotation-defaults";
import type { AnnotationFile } from "@mahomanual/core/schema";
import type { AnnotationTheme } from "@mahomanual/core/theme";
import { saveAnnotation, subscribeProjectWatch } from "./api.js";
import type { AnnotationDocument } from "./use-annotation-document.js";

export interface AnnotationPayload {
  annotation: AnnotationFile;
  naturalSizes: Record<string, { w: number; h: number }>;
  theme?: AnnotationTheme;
  defaults?: AnnotationDefaults;
}

interface MergeContext {
  local: AnnotationFile;
  remote: AnnotationFile;
  merged: AnnotationFile;
}

interface UseAnnotationSyncOptions {
  project: string;
  annotationId: string;
  annotationRef: MutableRefObject<AnnotationFile | null>;
  dirtyRef: MutableRefObject<boolean>;
  replaceDocument: AnnotationDocument["replaceDocument"];
  markSaved: AnnotationDocument["markSaved"];
  getSavedBase: AnnotationDocument["getSavedBase"];
  isSameAsCurrent: AnnotationDocument["isSameAsCurrent"];
  onBack?: () => void;
  onNavigateToAnnotation?: (id: string) => void;
  onSaved?: () => void;
  /** annotationId 切り替え時、このフックの外側にある状態(表示倍率・生成中ツールなど)をリセットする */
  resetOnLoad: () => void;
  onPayloadApplied: (payload: AnnotationPayload) => void;
  onError: (message: string) => void;
  onStatus: (message: string) => void;
}

/**
 * 注釈データのサーバー同期(読み込み・保存・外部変更の検知とマージ・離脱防止)を閉じる。
 * UI はこれを呼び、fetch/EventSource を直接触らない。
 */
export function useAnnotationSync({
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
  resetOnLoad,
  onPayloadApplied,
  onError,
  onStatus,
}: UseAnnotationSyncOptions) {
  const [annotationIds, setAnnotationIds] = useState<string[]>([]);
  const [externalPayload, setExternalPayload] = useState<AnnotationPayload | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<string | "back" | null>(null);
  const [mergeConflicts, setMergeConflicts] = useState<ObjectConflict[]>([]);
  const [mergeResolutions, setMergeResolutions] = useState<Record<string, "local" | "remote">>({});
  const [mergeContext, setMergeContext] = useState<MergeContext | null>(null);

  const fetchPayload = useCallback(async (): Promise<AnnotationPayload> => {
    const response = await fetch(
      `/api/projects/${encodeURIComponent(project)}/annotations/${encodeURIComponent(annotationId)}`,
    );
    if (!response.ok) {
      throw new Error("注釈の読み込みに失敗しました");
    }
    const payload = (await response.json()) as AnnotationPayload;
    return { ...payload, annotation: normalizeTextBoxes(payload.annotation) };
  }, [project, annotationId]);

  const applyPayload = useCallback((payload: AnnotationPayload) => {
    const normalized = normalizeTextBoxes(payload.annotation);
    replaceDocument(normalized, {
      savedSnapshot: normalized,
      dirty: false,
      clearHistory: true,
    });
    onPayloadApplied(payload);
    setExternalPayload(null);
  }, [replaceDocument, onPayloadApplied]);

  const requestNavigation = useCallback((target: string | "back") => {
    if (dirtyRef.current) {
      setPendingNavigation(target);
      return;
    }
    if (target === "back") {
      onBack?.();
      return;
    }
    onNavigateToAnnotation?.(target);
  }, [dirtyRef, onBack, onNavigateToAnnotation]);

  const handleSave = useCallback(async () => {
    const current = annotationRef.current;
    if (!current) {
      return;
    }
    try {
      const saved = await saveAnnotation(project, annotationId, current);
      // サーバーで zod 正規化された内容を保持し、保存エコーの同一判定を確実にする
      markSaved(saved.annotation);
      onStatus("保存しました");
      onSaved?.();
    } catch (err) {
      onError(err instanceof Error ? err.message : "保存に失敗しました");
    }
  }, [annotationRef, project, annotationId, markSaved, onStatus, onSaved, onError]);

  const completePendingNavigation = useCallback(async (mode: "save" | "discard") => {
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
      onBack?.();
    } else {
      onNavigateToAnnotation?.(target);
    }
  }, [pendingNavigation, handleSave, dirtyRef, fetchPayload, applyPayload, onBack, onNavigateToAnnotation]);

  const applyMergeResolution = useCallback(() => {
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
  }, [mergeContext, mergeResolutions, replaceDocument]);

  const keepLocalMerge = useCallback(() => {
    setMergeConflicts([]);
    setMergeContext(null);
    setMergeResolutions({});
  }, []);

  useEffect(() => {
    onError("");
    resetOnLoad();
    setMergeConflicts([]);
    setMergeContext(null);
    void fetchPayload()
      .then(applyPayload)
      .catch((err: Error) => onError(err.message));
    void fetch(`/api/projects/${encodeURIComponent(project)}/manual`)
      .then((response) => response.json())
      .then((body: { annotations?: string[] }) => setAnnotationIds(body.annotations ?? []))
      .catch(() => setAnnotationIds([]));
  }, [project, annotationId]);

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
        .catch((err: Error) => onError(err.message));
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
  }, [dirtyRef]);

  return {
    annotationIds,
    externalPayload,
    setExternalPayload,
    pendingNavigation,
    setPendingNavigation,
    mergeConflicts,
    mergeResolutions,
    setMergeResolutions,
    requestNavigation,
    completePendingNavigation,
    applyMergeResolution,
    keepLocalMerge,
    handleSave,
    applyPayload,
    fetchPayload,
  };
}

export type AnnotationSync = ReturnType<typeof useAnnotationSync>;
