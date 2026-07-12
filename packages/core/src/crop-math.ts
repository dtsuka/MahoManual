export interface PixelSize {
  w: number;
  h: number;
}

export interface PixelRect extends PixelSize {
  x: number;
  y: number;
}

export function fullImageCrop(natural: PixelSize): PixelRect {
  return { x: 0, y: 0, w: natural.w, h: natural.h };
}

export function clampCrop(crop: PixelRect, natural: PixelSize): PixelRect {
  const x = Math.max(0, Math.min(crop.x, natural.w - 1));
  const y = Math.max(0, Math.min(crop.y, natural.h - 1));
  return {
    x,
    y,
    w: Math.max(1, Math.min(crop.w, natural.w - x)),
    h: Math.max(1, Math.min(crop.h, natural.h - y)),
  };
}

export function validateCrop(crop: PixelRect, natural: PixelSize, src?: string): PixelRect {
  const pixelCrop = {
    x: Math.round(crop.x),
    y: Math.round(crop.y),
    w: Math.round(crop.w),
    h: Math.round(crop.h),
  };
  if (
    pixelCrop.x < 0 ||
    pixelCrop.y < 0 ||
    pixelCrop.w < 1 ||
    pixelCrop.h < 1 ||
    pixelCrop.x + pixelCrop.w > natural.w ||
    pixelCrop.y + pixelCrop.h > natural.h
  ) {
    throw new Error(`crop is outside the source image: ${src ?? "image"}`);
  }
  return pixelCrop;
}

export type CropHandle = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

export function resizeCrop(
  crop: PixelRect,
  handle: CropHandle,
  delta: { dx: number; dy: number },
  natural: PixelSize,
): PixelRect {
  let { x, y, w, h } = crop;
  if (handle.includes("e")) {
    w = Math.max(1, w + delta.dx);
  }
  if (handle.includes("s")) {
    h = Math.max(1, h + delta.dy);
  }
  if (handle.includes("w")) {
    const nextX = Math.min(x + delta.dx, x + w - 1);
    w -= nextX - x;
    x = nextX;
  }
  if (handle.includes("n")) {
    const nextY = Math.min(y + delta.dy, y + h - 1);
    h -= nextY - y;
    y = nextY;
  }
  return clampCrop({ x, y, w, h }, natural);
}

export interface RectPct {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * ビジュアルクロップ編集用に、現在の crop→rect 縮尺で元画像全体の表示 rect を復元する。
 * 編集中はこの rect + フルcrop で描画し、縦横比を崩さずクロップ窓を重ねる。
 */
export function revealRectForCropEdit(
  rect: RectPct,
  crop: PixelRect,
  natural: PixelSize,
  canvas: { width: number; height: number },
): RectPct {
  const scale = ((rect.w / 100) * canvas.width) / Math.max(crop.w, 1);
  const rectX = (rect.x / 100) * canvas.width;
  const rectY = (rect.y / 100) * canvas.height;
  return {
    x: ((rectX - crop.x * scale) / canvas.width) * 100,
    y: ((rectY - crop.y * scale) / canvas.height) * 100,
    w: (natural.w * scale / canvas.width) * 100,
    h: (natural.h * scale / canvas.height) * 100,
  };
}

/** reveal rect 上の crop 領域をキャンバス%の配置 rect へ写す */
export function rectFromCropInReveal(
  reveal: RectPct,
  crop: PixelRect,
  natural: PixelSize,
): RectPct {
  return {
    x: reveal.x + (crop.x / natural.w) * reveal.w,
    y: reveal.y + (crop.y / natural.h) * reveal.h,
    w: (crop.w / natural.w) * reveal.w,
    h: (crop.h / natural.h) * reveal.h,
  };
}
