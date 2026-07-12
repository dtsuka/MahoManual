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
