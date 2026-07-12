import { useCallback, useState } from "react";
import type { PixelRect, PixelSize } from "@mahomanual/core/crop-math";
import type { AnnotationFile } from "@mahomanual/core/schema";
import {
  applyCropCommit,
  tryBeginVisualCrop,
  withFullImageCrop,
  type VisualCropSession,
} from "./visual-crop-session.js";

interface UseVisualCropEditOptions {
  getAnnotation: () => AnnotationFile | null;
  naturalSizes: Record<string, PixelSize>;
  applyTransientChange: (updater: (current: AnnotationFile) => AnnotationFile) => void;
  commitTransientChange: (start: AnnotationFile) => void;
  onOpened: (imageId: string) => void;
}

/**
 * ビジュアルクロップ編集セッション。
 * open/commit/cancel と draft crop を閉じ、keyboard からも同じ関数を直接呼べる。
 */
export function useVisualCropEdit({
  getAnnotation,
  naturalSizes,
  applyTransientChange,
  commitTransientChange,
  onOpened,
}: UseVisualCropEditOptions) {
  const [session, setSession] = useState<VisualCropSession | null>(null);

  const open = useCallback((imageId: string) => {
    const current = getAnnotation();
    if (!current) {
      return;
    }
    const begun = tryBeginVisualCrop(current, imageId, naturalSizes);
    if (!begun) {
      return;
    }
    applyTransientChange(() => begun.staging);
    onOpened(imageId);
    setSession(begun.session);
  }, [applyTransientChange, getAnnotation, naturalSizes, onOpened]);

  const commit = useCallback(() => {
    if (!session) {
      return;
    }
    applyTransientChange((current) => applyCropCommit(current, session));
    commitTransientChange(session.start);
    setSession(null);
  }, [applyTransientChange, commitTransientChange, session]);

  const cancel = useCallback(() => {
    if (!session) {
      return;
    }
    applyTransientChange(() => session.start);
    setSession(null);
  }, [applyTransientChange, session]);

  const setCrop = useCallback((crop: PixelRect) => {
    setSession((current) => (current ? { ...current, crop } : current));
  }, []);

  const resetFull = useCallback(() => {
    setSession((current) => (current ? withFullImageCrop(current) : current));
  }, []);

  return {
    session,
    active: session !== null,
    open,
    commit,
    cancel,
    setCrop,
    resetFull,
  };
}
