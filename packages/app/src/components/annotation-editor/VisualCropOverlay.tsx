import type { PointerEvent as ReactPointerEvent } from "react";
import {
  clampCrop,
  resizeCrop,
  type CropHandle,
  type PixelRect,
  type PixelSize,
} from "@mahomanual/core/crop-math";
import type { AnnotationObject } from "@mahomanual/core/schema";
import { FRAME_HANDLES } from "./helpers.js";

interface VisualCropOverlayProps {
  image: Extract<AnnotationObject, { type: "image" }>;
  canvas: { width: number; height: number };
  natural: PixelSize;
  crop: PixelRect;
  onCropChange: (crop: PixelRect) => void;
}

function cropToOverlayStyle(
  imageRect: { x: number; y: number; w: number; h: number },
  crop: PixelRect,
  natural: PixelSize,
) {
  const cropLeftPct = (crop.x / natural.w) * imageRect.w;
  const cropTopPct = (crop.y / natural.h) * imageRect.h;
  const cropWidthPct = (crop.w / natural.w) * imageRect.w;
  const cropHeightPct = (crop.h / natural.h) * imageRect.h;
  return {
    left: `${imageRect.x + cropLeftPct}%`,
    top: `${imageRect.y + cropTopPct}%`,
    width: `${cropWidthPct}%`,
    height: `${cropHeightPct}%`,
  };
}

function fullImageOverlayStyle(imageRect: { x: number; y: number; w: number; h: number }) {
  return {
    left: `${imageRect.x}%`,
    top: `${imageRect.y}%`,
    width: `${imageRect.w}%`,
    height: `${imageRect.h}%`,
  };
}

function clientToSourcePixels(
  clientX: number,
  clientY: number,
  box: DOMRect,
  imageRect: { x: number; y: number; w: number; h: number },
  canvas: { width: number; height: number },
  natural: PixelSize,
): { x: number; y: number } {
  const canvasX = ((clientX - box.left) / box.width) * canvas.width;
  const canvasY = ((clientY - box.top) / box.height) * canvas.height;
  const imageLeft = (imageRect.x / 100) * canvas.width;
  const imageTop = (imageRect.y / 100) * canvas.height;
  const imageWidth = (imageRect.w / 100) * canvas.width;
  const imageHeight = (imageRect.h / 100) * canvas.height;
  return {
    x: ((canvasX - imageLeft) / imageWidth) * natural.w,
    y: ((canvasY - imageTop) / imageHeight) * natural.h,
  };
}

function resolveFigureBox(target: HTMLElement): DOMRect | null {
  const figure = target
    .closest("[data-editor-canvas]")
    ?.querySelector(".mm-editor-figure figure");
  return figure?.getBoundingClientRect() ?? null;
}

function beginCropPointerDrag(
  event: ReactPointerEvent,
  crop: PixelRect,
  imageRect: { x: number; y: number; w: number; h: number },
  canvas: { width: number; height: number },
  natural: PixelSize,
  applyDelta: (crop0: PixelRect, dx: number, dy: number) => PixelRect,
  onCropChange: (crop: PixelRect) => void,
) {
  event.preventDefault();
  event.stopPropagation();
  const box = resolveFigureBox(event.currentTarget as HTMLElement);
  if (!box) {
    return;
  }
  const startClient = { x: event.clientX, y: event.clientY };
  const crop0 = { ...crop };
  const onMove = (moveEvent: PointerEvent) => {
    const startPx = clientToSourcePixels(startClient.x, startClient.y, box, imageRect, canvas, natural);
    const currentPx = clientToSourcePixels(moveEvent.clientX, moveEvent.clientY, box, imageRect, canvas, natural);
    onCropChange(applyDelta(crop0, currentPx.x - startPx.x, currentPx.y - startPx.y));
  };
  const onUp = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

export function VisualCropOverlay({
  image,
  canvas,
  natural,
  crop,
  onCropChange,
}: VisualCropOverlayProps) {
  const imageRect = image.rect;
  const cropStyle = cropToOverlayStyle(imageRect, crop, natural);
  const fullStyle = fullImageOverlayStyle(imageRect);

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-20"
      data-testid="visual-crop-overlay"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <div className="mm-crop-full" style={fullStyle} />
      <div
        className="mm-crop-window"
        style={cropStyle}
        data-testid="crop-window"
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest(".mm-crop-handle")) {
            return;
          }
          beginCropPointerDrag(
            event,
            crop,
            imageRect,
            canvas,
            natural,
            (crop0, dx, dy) => clampCrop({
              x: crop0.x + dx,
              y: crop0.y + dy,
              w: crop0.w,
              h: crop0.h,
            }, natural),
            onCropChange,
          );
        }}
      >
        {FRAME_HANDLES.map((handle) => (
          <div
            key={handle.dir}
            data-testid={`crop-handle-${handle.dir}`}
            className="mm-crop-handle"
            style={{
              left: `${handle.fx * 100}%`,
              top: `${handle.fy * 100}%`,
              cursor: handle.cursor,
            }}
            onPointerDown={(event) => {
              beginCropPointerDrag(
                event,
                crop,
                imageRect,
                canvas,
                natural,
                (crop0, dx, dy) => resizeCrop(
                  crop0,
                  handle.dir as CropHandle,
                  { dx, dy },
                  natural,
                ),
                onCropChange,
              );
            }}
          />
        ))}
      </div>
    </div>
  );
}
