import type { AnnotationFile, AnnotationObject } from "./schema.js";
import { setTextBoxRect, textBoxRect } from "./annotation-objects.js";

// SPEC §4.5: キャンバス余白。canvasを拡張し、全オブジェクトの%座標を
// 再計算して見た目上の位置を維持する(crop・size・fontSize等のpx値は不変)
export interface CanvasMargin {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

interface PointPct {
  x: number;
  y: number;
}

interface RectPct extends PointPct {
  w: number;
  h: number;
}

export interface CanvasSize {
  width: number;
  height: number;
}

// オブジェクトの%座標を、canvas `from` から canvas `to` へ移す。
// `from` 上の位置(px)に offset(px)を足した位置が `to` 上の位置になる(crop・size・fontSize等のpx値は不変)
export function remapObjects(
  objects: readonly AnnotationObject[],
  from: CanvasSize,
  to: CanvasSize,
  offset: { x: number; y: number },
): AnnotationObject[] {
  const mapPoint = (point: PointPct): PointPct => ({
    x: (((point.x / 100) * from.width + offset.x) / to.width) * 100,
    y: (((point.y / 100) * from.height + offset.y) / to.height) * 100,
  });
  const mapRect = (rect: RectPct): RectPct => ({
    ...mapPoint(rect),
    w: (rect.w * from.width) / to.width,
    h: (rect.h * from.height) / to.height,
  });

  return objects.map((obj): AnnotationObject => {
    switch (obj.type) {
      case "image":
      case "frame":
      case "mosaic":
        return { ...obj, rect: mapRect(obj.rect) };
      case "text":
        // 描画・編集の正本は rect。at はボックス中心として同期する
        return setTextBoxRect(obj, mapRect(textBoxRect(obj)));
      case "badge":
      case "cursor":
        return { ...obj, at: mapPoint(obj.at) };
      case "line":
      case "arrow":
        return { ...obj, points: obj.points.map(mapPoint) };
      default: {
        const _exhaustive: never = obj;
        return _exhaustive;
      }
    }
  });
}

export function expandCanvas(annotation: AnnotationFile, margin: CanvasMargin): AnnotationFile {
  const { top = 0, right = 0, bottom = 0, left = 0 } = margin;
  for (const [key, value] of Object.entries({ top, right, bottom, left })) {
    if (!Number.isFinite(value)) {
      throw new Error(`margin.${key} must be a finite number`);
    }
  }

  const oldWidth = annotation.canvas.width;
  const oldHeight = annotation.canvas.height;
  const newWidth = oldWidth + left + right;
  const newHeight = oldHeight + top + bottom;
  if (newWidth <= 0 || newHeight <= 0) {
    throw new Error(`canvas size must stay positive after applying margin: ${newWidth}×${newHeight}`);
  }

  const canvas = { width: newWidth, height: newHeight };
  return {
    ...annotation,
    canvas,
    objects: remapObjects(annotation.objects, annotation.canvas, canvas, { x: left, y: top }),
  };
}
