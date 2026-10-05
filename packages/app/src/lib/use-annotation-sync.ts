import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeTextBoxes } from "@mahomanual/core/annotation-objects";
import { mergeAnnotationEdits, resolveConflicts, type ObjectConflict } from "@mahomanual/core/merge-annotation-edits";
import type { AnnotationDefaults } from "@mahomanual/core/annotation-defaults";
import type { AnnotationFile } from "@mahomanual/core/schema";
import type { AnnotationTheme } from "@mahomanual/core/theme";
import { saveAnnotation, subscribeProjectWatch } from "./api.js";
import { mergeServerImageChange } from "./annotation-image-merge.js";
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
  document: AnnotationDocument;
  onBack?: () => void;
  onNavigateToAnnotation?: (id: string) => void;
  onSaved?: () => void;
  /** false を返すと保存しない(切り抜き調整中など)。保存直前の確定処理もここで行う */
  canSave?: () => boolean;
  /** annotationId 切り替え時、このフックの外側にある状態(表示倍率・生成中ツールなど)をリセットする */
  resetOnLoad: () => void;
  onPayloadApplied: (payload: AnnotationPayload) => void;
  /** 注釈そのものを読み込めなかった(編集画面を出せない) */
  onLoadError: (message: string) => void;
  /** 保存・外部変更の取り込みなど操作の失敗(編集画面は残す) */
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
  document,
  onBack,
  onNavigateToAnnotation,
  onSaved,
  canSave,
  resetOnLoad,
  onPayloadApplied,
  onLoadError,
  onError,
  onStatus,
}: UseAnnotationSyncOptions) {
  const {
    annotationRef,
    dirtyRef,
    replaceDocument,
    applyLocalChange,
    markSaved,
    rebaseSaved,
    getSavedBase,
    isSavedBase,
    isSameAsCurrent,
  } = document;
  const [annotationIds, setAnnotationIds] = useState<string[]>([]);
  const [externalPayload, setExternalPayload] = useState<AnnotationPayload | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<string | "back" | null>(null);
  const [mergeConflicts, setMergeConflicts] = useState<ObjectConflict[]>([]);
  const [mergeResolutions, setMergeResolutions] = useState<Record<string, "local" | "remote">>({});
  const [mergeContext, setMergeContext] = useState<MergeContext | null>(null);
  /** 表示中の注釈の世代。切り替え後に返ってきた古い応答を捨てるために使う */
  const generationRef = useRef(0);
  const currentKeyRef = useRef(`${project}\u0000${annotationId}`);
  currentKeyRef.current = `${project}\u0000${annotationId}`;

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

  /**
   * 画像の追加・置換の応答(サーバーで保存済み)を、未保存の編集を残したまま取り込む。
   * 対象オブジェクトとキャンバスの変更だけを元に戻せる1件の編集として合流させる。
   */
  const applyServerImageChange = useCallback((payload: AnnotationPayload, objectId: string) => {
    const local = annotationRef.current;
    if (!local) {
      applyPayload(payload);
      return;
    }
    const remote = normalizeTextBoxes(payload.annotation);
    const merged = mergeServerImageChange(getSavedBase(), local, remote, objectId);
    applyLocalChange(() => merged);
    rebaseSaved(remote);
    onPayloadApplied(payload);
  }, [annotationRef, applyPayload, getSavedBase, applyLocalChange, rebaseSaved, onPayloadApplied]);

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
    if (canSave && !canSave()) {
      return;
    }
    const sent = annotationRef.current;
    if (!sent) {
      return;
    }
    const key = currentKeyRef.current;
    try {
      const saved = await saveAnnotation(project, annotationId, sent);
      if (currentKeyRef.current !== key) {
        return;
      }
      // サーバーで zod 正規化された内容を保持し、保存エコーの同一判定を確実にする。
      // 保存中に編集が続いていれば手元は残す
      markSaved(saved.annotation, sent);
      onStatus("保存しました");
      onSaved?.();
    } catch (err) {
      onError(err instanceof Error ? err.message : "保存に失敗しました");
    }
  }, [canSave, annotationRef, project, annotationId, markSaved, onStatus, onSaved, onError]);

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
    }
    // 破棄時は遷移先で読み直すため、ここでは読み込まない
    setPendingNavigation(null);
    if (target === "back") {
      onBack?.();
    } else {
      onNavigateToAnnotation?.(target);
    }
  }, [pendingNavigation, handleSave, dirtyRef, onBack, onNavigateToAnnotation]);

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
    const generation = ++generationRef.current;
    const isCurrent = () => generationRef.current === generation;
    onLoadError("");
    resetOnLoad();
    setMergeConflicts([]);
    setMergeContext(null);
    setMergeResolutions({});
    setExternalPayload(null);
    setPendingNavigation(null);
    void fetchPayload()
      .then((payload) => {
        if (isCurrent()) {
          applyPayload(payload);
        }
      })
      .catch((err: Error) => {
        if (isCurrent()) {
          onLoadError(err.message);
        }
      });
    void fetch(`/api/projects/${encodeURIComponent(project)}/manual`)
      .then((response) => response.json())
      .then((body: { annotations?: string[] }) => {
        if (isCurrent()) {
          setAnnotationIds(body.annotations ?? []);
        }
      })
      .catch(() => {
        if (isCurrent()) {
          setAnnotationIds([]);
        }
      });
    return () => {
      // アンマウント・切り替え後に返ってきた応答は捨てる
      if (generationRef.current === generation) {
        generationRef.current += 1;
      }
    };
  }, [project, annotationId]);

  useEffect(() => {
    const generation = generationRef.current;
    const isCurrent = () => generationRef.current === generation;
    return subscribeProjectWatch(project, (event) => {
      if (event.path !== `annotations/${annotationId}.json`) {
        return;
      }
      void fetchPayload()
        .then((payload) => {
          if (!isCurrent()) {
            return;
          }
          // 自分の保存によるエコー(保存済みの内容・現在の内容と同じ)は無視する
          if (isSameAsCurrent(payload.annotation) || isSavedBase(payload.annotation)) {
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
        .catch((err: Error) => {
          if (isCurrent()) {
            onError(err.message);
          }
        });
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
    applyServerImageChange,
    fetchPayload,
  };
}

export type AnnotationSync = ReturnType<typeof useAnnotationSync>;
