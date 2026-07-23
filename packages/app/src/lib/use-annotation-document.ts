import { useCallback, useRef, useState } from "react";
import { isEditable, isLineObject } from "@mahomanual/core/annotation-objects";
import type { AnnotationFile } from "@mahomanual/core/schema";
import { translateObjects } from "./annotation-operations.js";
import { translateSelectedPoints } from "./line-point-selection.js";

const MAX_HISTORY = 100;

function annotationJson(value: AnnotationFile): string {
  return JSON.stringify(value);
}

function sameAnnotation(a: AnnotationFile, b: AnnotationFile): boolean {
  return annotationJson(a) === annotationJson(b);
}

/**
 * 注釈ドキュメントの真実(現在値・保存スナップショット・履歴・dirty)を一箇所に閉じる。
 * UI はこれを呼び、独自に JSON.stringify / history を触らない。
 */
export function useAnnotationDocument() {
  const [annotation, setAnnotation] = useState<AnnotationFile | null>(null);
  const [dirty, setDirty] = useState(false);
  const [, setHistoryVersion] = useState(0);
  const annotationRef = useRef<AnnotationFile | null>(null);
  const dirtyRef = useRef(false);
  const savedAnnotationJsonRef = useRef("");
  const historyRef = useRef<{ past: AnnotationFile[]; future: AnnotationFile[] }>({
    past: [],
    future: [],
  });
  const arrowCoalesceRef = useRef<{
    timer?: ReturnType<typeof setTimeout>;
    start?: AnnotationFile;
  }>({});

  const bumpHistory = useCallback(() => {
    setHistoryVersion((version) => version + 1);
  }, []);

  const syncDirty = useCallback((next: AnnotationFile) => {
    const nextDirty = annotationJson(next) !== savedAnnotationJsonRef.current;
    dirtyRef.current = nextDirty;
    setDirty(nextDirty);
  }, []);

  const pushPast = useCallback((snapshot: AnnotationFile) => {
    historyRef.current = {
      past: [...historyRef.current.past, snapshot].slice(-MAX_HISTORY),
      future: [],
    };
    bumpHistory();
  }, [bumpHistory]);

  const replaceDocument = useCallback((next: AnnotationFile, options?: {
    savedSnapshot?: AnnotationFile;
    dirty?: boolean;
    clearHistory?: boolean;
  }) => {
    annotationRef.current = next;
    setAnnotation(next);
    if (options?.savedSnapshot) {
      savedAnnotationJsonRef.current = annotationJson(options.savedSnapshot);
    }
    if (options?.clearHistory !== false) {
      historyRef.current = { past: [], future: [] };
      bumpHistory();
    }
    if (options?.dirty !== undefined) {
      dirtyRef.current = options.dirty;
      setDirty(options.dirty);
    } else {
      syncDirty(next);
    }
  }, [bumpHistory, syncDirty]);

  const applyLocalChange = useCallback((updater: (current: AnnotationFile) => AnnotationFile) => {
    const current = annotationRef.current;
    if (!current) {
      return;
    }
    const next = updater(current);
    if (next === current) {
      return;
    }
    pushPast(current);
    annotationRef.current = next;
    setAnnotation(next);
    syncDirty(next);
  }, [pushPast, syncDirty]);

  const applyTransientChange = useCallback((updater: (current: AnnotationFile) => AnnotationFile) => {
    const current = annotationRef.current;
    if (!current) {
      return;
    }
    const next = updater(current);
    annotationRef.current = next;
    setAnnotation(next);
    syncDirty(next);
  }, [syncDirty]);

  const commitTransientChange = useCallback((start: AnnotationFile) => {
    const current = annotationRef.current;
    if (!current || sameAnnotation(start, current)) {
      return;
    }
    pushPast(start);
  }, [pushPast]);

  const commitArrowCoalesce = useCallback(() => {
    const start = arrowCoalesceRef.current.start;
    const current = annotationRef.current;
    if (!start || !current || sameAnnotation(start, current)) {
      arrowCoalesceRef.current = {};
      return;
    }
    pushPast(start);
    arrowCoalesceRef.current = {};
  }, [pushPast]);

  const nudgeWithCoalesce = useCallback((
    mutate: (latest: AnnotationFile) => AnnotationFile,
  ) => {
    const current = annotationRef.current;
    if (!current) {
      return;
    }
    if (!arrowCoalesceRef.current.start) {
      arrowCoalesceRef.current.start = structuredClone(current);
    }
    applyTransientChange(mutate);
    if (arrowCoalesceRef.current.timer) {
      clearTimeout(arrowCoalesceRef.current.timer);
    }
    arrowCoalesceRef.current.timer = setTimeout(commitArrowCoalesce, 250);
  }, [applyTransientChange, commitArrowCoalesce]);

  const nudgeSelection = useCallback((selectedIds: readonly string[], dx: number, dy: number) => {
    nudgeWithCoalesce((latest) => ({
      ...latest,
      objects: translateObjects(latest.objects, new Set(selectedIds), dx, dy),
    }));
  }, [nudgeWithCoalesce]);

  const nudgeLinePoints = useCallback((
    objectId: string,
    pointIndices: readonly number[],
    dx: number,
    dy: number,
  ) => {
    if (pointIndices.length === 0) {
      return;
    }
    nudgeWithCoalesce((latest) => ({
      ...latest,
      objects: latest.objects.map((obj) => {
        if (obj.id !== objectId || !isEditable(obj) || !isLineObject(obj)) {
          return obj;
        }
        return {
          ...obj,
          points: translateSelectedPoints(obj.points, pointIndices, dx, dy),
        };
      }),
    }));
  }, [nudgeWithCoalesce]);

  const restoreHistoryAnnotation = useCallback((next: AnnotationFile) => {
    annotationRef.current = next;
    setAnnotation(next);
    syncDirty(next);
    bumpHistory();
  }, [bumpHistory, syncDirty]);

  const undo = useCallback((): AnnotationFile | null => {
    const current = annotationRef.current;
    const previous = historyRef.current.past.at(-1);
    if (!current || !previous) {
      return null;
    }
    historyRef.current = {
      past: historyRef.current.past.slice(0, -1),
      future: [current, ...historyRef.current.future].slice(0, MAX_HISTORY),
    };
    restoreHistoryAnnotation(previous);
    return previous;
  }, [restoreHistoryAnnotation]);

  const redo = useCallback((): AnnotationFile | null => {
    const current = annotationRef.current;
    const next = historyRef.current.future[0];
    if (!current || !next) {
      return null;
    }
    historyRef.current = {
      past: [...historyRef.current.past, current].slice(-MAX_HISTORY),
      future: historyRef.current.future.slice(1),
    };
    restoreHistoryAnnotation(next);
    return next;
  }, [restoreHistoryAnnotation]);

  const markSaved = useCallback((saved: AnnotationFile) => {
    annotationRef.current = saved;
    savedAnnotationJsonRef.current = annotationJson(saved);
    setAnnotation(saved);
    dirtyRef.current = false;
    setDirty(false);
  }, []);

  const getSavedBase = useCallback((): AnnotationFile => {
    return JSON.parse(savedAnnotationJsonRef.current) as AnnotationFile;
  }, []);

  const isSameAsCurrent = useCallback((candidate: AnnotationFile): boolean => {
    const current = annotationRef.current;
    return !!current && sameAnnotation(candidate, current);
  }, []);

  return {
    annotation,
    annotationRef,
    dirty,
    dirtyRef,
    canUndo: historyRef.current.past.length > 0,
    canRedo: historyRef.current.future.length > 0,
    applyLocalChange,
    applyTransientChange,
    commitTransientChange,
    commitArrowCoalesce,
    nudgeSelection,
    nudgeLinePoints,
    undo,
    redo,
    replaceDocument,
    markSaved,
    getSavedBase,
    isSameAsCurrent,
  };
}

export type AnnotationDocument = ReturnType<typeof useAnnotationDocument>;
