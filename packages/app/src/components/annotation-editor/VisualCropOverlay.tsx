import type { PointerEvent as ReactPointerEvent } from "react";
import { fullImageCrop, resizeCrop, type CropHandle } from "@mahomanual/core/crop-math";
import type { AnnotationObject } from "@mahomanual/core/schema";
import { Button } from "../ui.js";
import { FRAME_HANDLES } from "./helpers.js";

interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface NaturalSize {
  w: number;
  h: number;
}

interface VisualCropOverlayProps {
  image: Extract<AnnotationObject, { type: "image" }>;
  canvas: { width: number; height: number };
  natural: NaturalSize;
  crop: PixelRect;
  onCropChange: (crop: PixelRect) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

function cropToOverlayStyle(
  imageRect: { x: number; y: number; w: number; h: number },
  crop: PixelRect,
  natural: NaturalSize,
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
  natural: NaturalSize,
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

export function VisualCropOverlay({
  image,
  canvas,
  natural,
  crop,
  onCropChange,
  onConfirm,
  onCancel,
}: VisualCropOverlayProps) {
  const imageRect = image.rect;
  const cropStyle = cropToOverlayStyle(imageRect, crop, natural);
  const fullStyle = fullImageOverlayStyle(imageRect);

  const startHandleDrag = (event: ReactPointerEvent, handle: CropHandle) => {
    event.preventDefault();
    event.stopPropagation();
    const figure = (event.currentTarget as HTMLElement)
      .closest("[data-editor-canvas]")
      ?.querySelector(".mm-editor-figure figure");
    const box = figure?.getBoundingClientRect();
    if (!box) {
      return;
    }
    const startClient = { x: event.clientX, y: event.clientY };
    const crop0 = { ...crop };
    const onMove = (moveEvent: PointerEvent) => {
      const startPx = clientToSourcePixels(startClient.x, startClient.y, box, imageRect, canvas, natural);
      const currentPx = clientToSourcePixels(moveEvent.clientX, moveEvent.clientY, box, imageRect, canvas, natural);
      onCropChange(
        resizeCrop(crop0, handle, { dx: currentPx.x - startPx.x, dy: currentPx.y - startPx.y }, natural),
      );
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-20"
      data-testid="visual-crop-overlay"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <div className="mm-crop-full" style={fullStyle} />
      <div className="mm-crop-dim" style={fullStyle} />
      <div className="mm-crop-window" style={cropStyle}>
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
            onPointerDown={(event) => startHandleDrag(event, handle.dir as CropHandle)}
          />
        ))}
      </div>
      <div className="mm-crop-toolbar">
        <Button size="sm" variant="secondary" data-testid="crop-reset-full" onClick={() => onCropChange(fullImageCrop(natural))}>
          全体に戻す
        </Button>
        <Button size="sm" variant="primary" data-testid="crop-confirm" onClick={onConfirm}>
          確定
        </Button>
        <Button size="sm" variant="secondary" data-testid="crop-cancel" onClick={onCancel}>
          取消
        </Button>
      </div>
    </div>
  );
}
