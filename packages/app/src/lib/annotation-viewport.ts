export const MIN_ZOOM = 25;
export const MAX_ZOOM = 400;
export const ZOOM_STEP = 25;

interface Size {
  width: number;
  height: number;
}

export function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

export function stepZoom(current: number, direction: -1 | 1): number {
  const stepped = direction > 0
    ? Math.ceil(current / ZOOM_STEP) * ZOOM_STEP + (current % ZOOM_STEP === 0 ? ZOOM_STEP : 0)
    : Math.floor(current / ZOOM_STEP) * ZOOM_STEP - (current % ZOOM_STEP === 0 ? ZOOM_STEP : 0);
  return clampZoom(stepped);
}

export function fitCanvasZoom(canvas: Size, viewport: Size, padding = 64): number {
  const availableWidth = Math.max(1, viewport.width - padding * 2);
  const availableHeight = Math.max(1, viewport.height - padding * 2);
  return clampZoom(Math.min(
    (availableWidth / canvas.width) * 100,
    (availableHeight / canvas.height) * 100,
  ));
}
