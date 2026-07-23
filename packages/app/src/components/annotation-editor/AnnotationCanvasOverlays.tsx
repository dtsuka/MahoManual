import type { PointerEvent as ReactPointerEvent } from "react";
import { isLineObject } from "@mahomanual/core/annotation-objects";
import type { SnapGuide } from "@mahomanual/core/object-geometry";
import type { AnnotationFile, AnnotationObject } from "@mahomanual/core/schema";
import { nextBadgeNumber } from "@mahomanual/core/annotation-ids";
import type { PointPct, RectPct } from "../../lib/geometry.js";
import { IconPointer } from "../icons.js";
import { FRAME_HANDLES } from "./helpers.js";
import type { EditorTool, RectCreationTool } from "./editor-tool.js";

function toCanvasPoints(points: PointPct[], canvas: { width: number; height: number }): string {
  return points
    .map((point) => `${(point.x / 100) * canvas.width},${(point.y / 100) * canvas.height}`)
    .join(" ");
}

interface AnnotationCanvasOverlaysProps {
  annotation: AnnotationFile;
  activeTool: EditorTool;
  activeFrameRect: RectPct | null;
  activeLinePoints: PointPct[] | null;
  selectedPointIndex: number | null;
  previewPoint: PointPct | null;
  rectDraft: { type: RectCreationTool; rect: RectPct } | null;
  previewLinePoints: PointPct[];
  marqueeDraft: RectPct | null;
  snapGuides: SnapGuide[];
  inlineTextEdit: { id: string; value: string } | null;
  onBeginRectResize: (event: ReactPointerEvent, dir: string) => void;
  onBeginPointDrag: (event: ReactPointerEvent, index: number) => void;
  onInlineTextEditChange: (value: { id: string; value: string } | null) => void;
  updateObject: (objectId: string, updater: (obj: AnnotationObject) => AnnotationObject) => void;
}

/**
 * figure と同じ%座標系に描く編集オーバーレイ。
 * ハンドル・作成中プレビュー・マーキー・スナップガイド・インラインテキスト編集を担う
 */
export function AnnotationCanvasOverlays({
  annotation,
  activeTool,
  activeFrameRect,
  activeLinePoints,
  selectedPointIndex,
  previewPoint,
  rectDraft,
  previewLinePoints,
  marqueeDraft,
  snapGuides,
  inlineTextEdit,
  onBeginRectResize,
  onBeginPointDrag,
  onInlineTextEditChange,
  updateObject,
}: AnnotationCanvasOverlaysProps) {
  const lineObjects = annotation.objects.filter(isLineObject);
  const textObj = inlineTextEdit
    ? annotation.objects.find((obj) => obj.id === inlineTextEdit.id && obj.type === "text")
    : null;

  const commitInlineText = () => {
    if (!inlineTextEdit) {
      return;
    }
    updateObject(inlineTextEdit.id, (obj) =>
      obj.type === "text" ? { ...obj, content: inlineTextEdit.value } : obj,
    );
    onInlineTextEditChange(null);
  };

  return (
    <div className="pointer-events-none absolute inset-0">
      <svg
        className="mm-editor-hit-layer"
        viewBox={`0 0 ${annotation.canvas.width} ${annotation.canvas.height}`}
        preserveAspectRatio="none"
      >
        {lineObjects.map((obj) => (
          <polyline
            key={obj.id}
            data-mm-id={obj.id}
            points={toCanvasPoints(obj.points, annotation.canvas)}
          />
        ))}
      </svg>
      {activeFrameRect
        ? FRAME_HANDLES.map((handle) => (
            <div
              key={handle.dir}
              data-testid={`frame-handle-${handle.dir}`}
              className="mm-editor-handle"
              style={{
                left: `${activeFrameRect.x + activeFrameRect.w * handle.fx}%`,
                top: `${activeFrameRect.y + activeFrameRect.h * handle.fy}%`,
                cursor: handle.cursor,
              }}
              onPointerDown={(event) => onBeginRectResize(event, handle.dir)}
            />
          ))
        : null}
      {activeLinePoints
        ? activeLinePoints.map((point, index) => (
            <div
              key={index}
              data-testid={`point-handle-${index}`}
              className={`mm-editor-handle mm-editor-handle--point ${
                selectedPointIndex === index ? "is-active" : ""
              }`}
              style={{ left: `${point.x}%`, top: `${point.y}%`, cursor: "move" }}
              onPointerDown={(event) => onBeginPointDrag(event, index)}
            />
          ))
        : null}
      {previewPoint ? (
        <div
          data-testid="creation-preview"
          className={`mm-creation-preview mm-creation-preview--${activeTool}`}
          style={{ left: `${previewPoint.x}%`, top: `${previewPoint.y}%` }}
        >
          {activeTool === "badge"
            ? nextBadgeNumber(annotation.objects)
            : activeTool === "text"
              ? "テキスト"
              : <IconPointer size={20} />}
        </div>
      ) : null}
      {rectDraft ? (
        <div
          data-testid="creation-preview"
          className={`mm-creation-preview-rect mm-creation-preview-rect--${rectDraft.type}`}
          style={{
            left: `${rectDraft.rect.x}%`,
            top: `${rectDraft.rect.y}%`,
            width: `${rectDraft.rect.w}%`,
            height: `${rectDraft.rect.h}%`,
          }}
        />
      ) : null}
      {previewLinePoints.length > 0 ? (
        <svg
          data-testid="creation-preview"
          className="mm-creation-preview-line"
          viewBox={`0 0 ${annotation.canvas.width} ${annotation.canvas.height}`}
          preserveAspectRatio="none"
        >
          <polyline points={toCanvasPoints(previewLinePoints, annotation.canvas)} />
        </svg>
      ) : null}
      {marqueeDraft ? (
        <div
          data-testid="marquee-preview"
          className="mm-marquee-preview"
          style={{
            left: `${marqueeDraft.x}%`,
            top: `${marqueeDraft.y}%`,
            width: `${marqueeDraft.w}%`,
            height: `${marqueeDraft.h}%`,
          }}
        />
      ) : null}
      {snapGuides.map((guide, index) => (
        <div
          key={`${guide.axis}-${guide.value}-${index}`}
          data-testid={`snap-guide-${guide.axis}`}
          className={`mm-snap-guide mm-snap-guide--${guide.axis}`}
          style={guide.axis === "x"
            ? { left: `${guide.value}%` }
            : { top: `${guide.value}%` }}
        />
      ))}
      {inlineTextEdit && textObj && textObj.type === "text" ? (
        <textarea
          data-testid="inline-text-editor"
          className="mm-inline-text-editor"
          style={textObj.rect
            ? {
                left: `${textObj.rect.x}%`,
                top: `${textObj.rect.y}%`,
                width: `${textObj.rect.w}%`,
                height: `${textObj.rect.h}%`,
              }
            : { left: `${textObj.at.x}%`, top: `${textObj.at.y}%` }}
          value={inlineTextEdit.value}
          autoFocus
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => onInlineTextEditChange({ id: inlineTextEdit.id, value: event.target.value })}
          onBlur={commitInlineText}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              commitInlineText();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              onInlineTextEditChange(null);
            }
          }}
        />
      ) : null}
    </div>
  );
}
