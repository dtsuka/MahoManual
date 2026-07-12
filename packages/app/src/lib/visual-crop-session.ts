import { isEditable } from "@mahomanual/core/annotation-objects";
import {
  fullImageCrop,
  rectFromCropInReveal,
  revealRectForCropEdit,
  type PixelRect,
  type PixelSize,
} from "@mahomanual/core/crop-math";
import type { AnnotationFile } from "@mahomanual/core/schema";

export interface VisualCropSession {
  imageId: string;
  crop: PixelRect;
  revealRect: { x: number; y: number; w: number; h: number };
  natural: PixelSize;
  start: AnnotationFile;
}

/**
 * ビジュアルクロップ開始: セッションと、フル画像表示用の staging 注釈を返す。
 * 対象が編集不可・natural 未解決なら null。
 */
export function tryBeginVisualCrop(
  annotation: AnnotationFile,
  imageId: string,
  naturalSizes: Record<string, PixelSize>,
): { session: VisualCropSession; staging: AnnotationFile } | null {
  const image = annotation.objects.find((obj) => obj.id === imageId && obj.type === "image");
  if (!image || image.type !== "image" || !isEditable(image)) {
    return null;
  }
  const natural = naturalSizes[image.src];
  if (!natural) {
    return null;
  }
  const crop = image.crop ?? fullImageCrop(natural);
  const revealRect = revealRectForCropEdit(image.rect, crop, natural, annotation.canvas);
  const start = structuredClone(annotation);
  const staging: AnnotationFile = {
    ...annotation,
    objects: annotation.objects.map((obj) =>
      obj.id === imageId && obj.type === "image"
        ? { ...obj, crop: fullImageCrop(natural), rect: revealRect }
        : obj,
    ),
  };
  return {
    session: {
      imageId,
      crop: { ...crop },
      revealRect,
      natural,
      start,
    },
    staging,
  };
}

/** セッションの crop を確定し、reveal 上の窓を配置 rect に戻す */
export function applyCropCommit(
  current: AnnotationFile,
  session: VisualCropSession,
): AnnotationFile {
  const nextRect = rectFromCropInReveal(session.revealRect, session.crop, session.natural);
  return {
    ...current,
    objects: current.objects.map((obj) =>
      obj.id === session.imageId && obj.type === "image"
        ? { ...obj, crop: session.crop, rect: nextRect }
        : obj,
    ),
  };
}

export function withFullImageCrop(session: VisualCropSession): VisualCropSession {
  return { ...session, crop: fullImageCrop(session.natural) };
}
