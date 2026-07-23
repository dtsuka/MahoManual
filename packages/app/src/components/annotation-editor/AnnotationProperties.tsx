import type { AnnotationFile, AnnotationObject } from "@mahomanual/core/schema";
import {
  editableRect,
  hasEditableRect,
  isEditable,
  isLineObject,
  withEditableRect,
} from "@mahomanual/core/annotation-objects";
import type { AnnotationTheme } from "@mahomanual/core/theme";
import { clampCrop } from "../../lib/annotation-operations.js";
import { Button, Kbd } from "../ui.js";
import { BadgeProperties } from "./properties/BadgeProperties.js";
import { CursorProperties } from "./properties/CursorProperties.js";
import { FrameProperties } from "./properties/FrameProperties.js";
import { ImageProperties } from "./properties/ImageProperties.js";
import { LineProperties } from "./properties/LineProperties.js";
import { MosaicProperties } from "./properties/MosaicProperties.js";
import { TextProperties } from "./properties/TextProperties.js";
import type { RectKey, UpdateObject } from "./properties/shared.js";

interface AnnotationPropertiesProps {
  selected: AnnotationObject | null;
  annotation: AnnotationFile;
  naturalSizes: Record<string, { w: number; h: number }>;
  theme: AnnotationTheme;
  selectedPointIndex: number | null;
  setSelectedPointIndex: (index: number | null) => void;
  updateObject: UpdateObject;
  onOpenReplaceImage: () => void;
  onOpenVisualCrop?: () => void;
  onResetImageSize?: () => void;
  onFitTextHeight?: () => void;
  hasProjectDefault?: boolean;
  onSaveProjectDefault?: () => void;
  onClearProjectDefault?: () => void;
  onApplyProjectDefault?: () => void;
}

function TypeProperties({
  selected,
  annotation,
  naturalSizes,
  theme,
  selectedPointIndex,
  setSelectedPointIndex,
  updateObject,
  updateAt,
  updateRect,
  updateCrop,
  updatePointValue,
  updateLineStyle,
  updateLineType,
  updateArrowHeads,
  addPoint,
  removePoint,
  onOpenReplaceImage,
  onOpenVisualCrop,
  onResetImageSize,
  onFitTextHeight,
}: {
  selected: AnnotationObject;
  annotation: AnnotationFile;
  naturalSizes: Record<string, { w: number; h: number }>;
  theme: AnnotationTheme;
  selectedPointIndex: number | null;
  setSelectedPointIndex: (index: number | null) => void;
  updateObject: UpdateObject;
  updateAt: (axis: "x" | "y", value: number) => void;
  updateRect: (key: RectKey, value: number) => void;
  updateCrop: (key: RectKey, value: number) => void;
  updatePointValue: (index: number, axis: "x" | "y", value: number) => void;
  updateLineStyle: (patch: { color?: string; strokeWidth?: number }) => void;
  updateLineType: (type: "line" | "arrow") => void;
  updateArrowHeads: (arrowHeads: "start" | "end" | "both") => void;
  addPoint: () => void;
  removePoint: (index: number) => void;
  onOpenReplaceImage: () => void;
  onOpenVisualCrop?: () => void;
  onResetImageSize?: () => void;
  onFitTextHeight?: () => void;
}) {
  switch (selected.type) {
    case "badge":
      return (
        <BadgeProperties
          selected={selected}
          theme={theme}
          updateObject={updateObject}
          updateAt={updateAt}
        />
      );
    case "text":
      return (
        <TextProperties
          selected={selected}
          theme={theme}
          updateObject={updateObject}
          updateRect={updateRect}
          onFitTextHeight={onFitTextHeight}
        />
      );
    case "cursor":
      return (
        <CursorProperties
          selected={selected}
          theme={theme}
          updateObject={updateObject}
          updateAt={updateAt}
        />
      );
    case "frame":
      return (
        <FrameProperties
          selected={selected}
          theme={theme}
          updateObject={updateObject}
          updateRect={updateRect}
        />
      );
    case "image":
      return (
        <ImageProperties
          selected={selected}
          theme={theme}
          naturalSizes={naturalSizes}
          updateObject={updateObject}
          updateRect={updateRect}
          updateCrop={updateCrop}
          onOpenReplaceImage={onOpenReplaceImage}
          onOpenVisualCrop={onOpenVisualCrop}
          onResetImageSize={onResetImageSize}
        />
      );
    case "mosaic":
      return (
        <MosaicProperties
          selected={selected}
          annotation={annotation}
          theme={theme}
          updateObject={updateObject}
          updateRect={updateRect}
        />
      );
    case "line":
    case "arrow":
      return (
        <LineProperties
          selected={selected}
          theme={theme}
          updateObject={updateObject}
          selectedPointIndex={selectedPointIndex}
          setSelectedPointIndex={setSelectedPointIndex}
          updatePointValue={updatePointValue}
          updateLineStyle={updateLineStyle}
          updateLineType={updateLineType}
          updateArrowHeads={updateArrowHeads}
          addPoint={addPoint}
          removePoint={removePoint}
        />
      );
    default: {
      const _exhaustive: never = selected;
      return _exhaustive;
    }
  }
}

export function AnnotationProperties({
  selected,
  annotation,
  naturalSizes,
  theme,
  selectedPointIndex,
  setSelectedPointIndex,
  updateObject,
  onOpenReplaceImage,
  onOpenVisualCrop,
  onResetImageSize,
  onFitTextHeight,
  hasProjectDefault,
  onSaveProjectDefault,
  onClearProjectDefault,
  onApplyProjectDefault,
}: AnnotationPropertiesProps) {
  const editableSelected = selected && isEditable(selected) ? selected : null;

  const updateAt = (axis: "x" | "y", value: number) => {
    if (!editableSelected || (editableSelected.type !== "badge" && editableSelected.type !== "cursor")) {
      return;
    }
    updateObject(editableSelected.id, (obj) =>
      obj.type === "badge" || obj.type === "cursor"
        ? { ...obj, at: { ...obj.at, [axis]: value } }
        : obj,
    );
  };

  const updateRect = (key: RectKey, value: number) => {
    if (!editableSelected || !hasEditableRect(editableSelected)) {
      return;
    }
    const clamped = key === "w" || key === "h" ? Math.max(0.5, value) : value;
    updateObject(editableSelected.id, (obj) => {
      if (!hasEditableRect(obj)) {
        return obj;
      }
      return withEditableRect(obj, { ...editableRect(obj), [key]: clamped });
    });
  };

  const updateCrop = (key: RectKey, value: number) => {
    if (!editableSelected || editableSelected.type !== "image") {
      return;
    }
    const natural = naturalSizes[editableSelected.src];
    if (!natural) {
      return;
    }
    const current = editableSelected.crop ?? { x: 0, y: 0, w: natural.w, h: natural.h };
    const next = clampCrop({ ...current, [key]: value }, natural);
    updateObject(editableSelected.id, (obj) => (obj.type === "image" ? { ...obj, crop: next } : obj));
  };

  const updatePointValue = (index: number, axis: "x" | "y", value: number) => {
    if (!editableSelected || !isLineObject(editableSelected)) {
      return;
    }
    updateObject(editableSelected.id, (obj) =>
      isLineObject(obj)
        ? {
            ...obj,
            points: obj.points.map((point, i) => (i === index ? { ...point, [axis]: value } : point)),
          }
        : obj,
    );
  };

  const updateLineStyle = (patch: { color?: string; strokeWidth?: number }) => {
    if (!editableSelected || !isLineObject(editableSelected)) {
      return;
    }
    updateObject(editableSelected.id, (obj) => (isLineObject(obj) ? { ...obj, ...patch } : obj));
  };

  const updateLineType = (type: "line" | "arrow") => {
    if (!editableSelected || !isLineObject(editableSelected)) {
      return;
    }
    updateObject(editableSelected.id, (obj) => {
      if (!isLineObject(obj)) {
        return obj;
      }
      if (type === "arrow") {
        return {
          ...obj,
          type: "arrow",
          arrowHeads: obj.type === "arrow" ? (obj.arrowHeads ?? "end") : "end",
        };
      }
      if (obj.type === "arrow") {
        const { arrowHeads: _arrowHeads, ...line } = obj;
        return { ...line, type: "line" };
      }
      return obj;
    });
  };

  const updateArrowHeads = (arrowHeads: "start" | "end" | "both") => {
    if (!editableSelected || editableSelected.type !== "arrow") {
      return;
    }
    updateObject(editableSelected.id, (obj) =>
      obj.type === "arrow" ? { ...obj, arrowHeads } : obj,
    );
  };

  const addPoint = () => {
    if (!editableSelected || !isLineObject(editableSelected)) {
      return;
    }
    const objectId = editableSelected.id;
    setSelectedPointIndex(editableSelected.points.length);
    updateObject(objectId, (obj) => {
      if (!isLineObject(obj)) {
        return obj;
      }
      const last = obj.points[obj.points.length - 1] ?? { x: 50, y: 50 };
      return { ...obj, points: [...obj.points, { x: Math.min(last.x + 8, 100), y: last.y }] };
    });
  };

  const removePoint = (index: number) => {
    if (!editableSelected || !isLineObject(editableSelected)) {
      return;
    }
    updateObject(editableSelected.id, (obj) => {
      if (!isLineObject(obj) || obj.points.length <= 2) {
        return obj;
      }
      return { ...obj, points: obj.points.filter((_, i) => i !== index) };
    });
    setSelectedPointIndex(
      selectedPointIndex === null
        ? null
        : selectedPointIndex === index
          ? null
          : selectedPointIndex > index
            ? selectedPointIndex - 1
            : selectedPointIndex,
    );
  };

  return (
    <>
      <section className="flex-1 p-3">
        <h2 className="mb-2 text-xs font-semibold text-slate-700">プロパティ</h2>
        {selected && !isEditable(selected) ? (
          <p className="mb-3 rounded-md bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
            このオブジェクトはロックされています。編集するには一覧の鍵を解除してください。
          </p>
        ) : null}
        {!selected ? (
          <p className="rounded-md bg-slate-50 px-3 py-4 text-xs leading-relaxed text-slate-500">
            オブジェクトをクリックして選択してください。バッジ・テキスト・枠・線はドラッグで移動できます。
          </p>
        ) : null}
        {editableSelected && editableSelected.type !== "image" && onApplyProjectDefault ? (
          <div className="mb-3 rounded-md bg-slate-50 px-2.5 py-2">
            <div className="mb-1.5 text-[11px] font-medium text-slate-600">選択中のスタイル</div>
            <Button
              size="sm"
              variant="secondary"
              data-testid="project-default-apply"
              onClick={onApplyProjectDefault}
            >
              デフォルトに戻す
            </Button>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
              色・サイズなどをプロジェクトの既定値に戻します。
            </p>
          </div>
        ) : null}
        {editableSelected && editableSelected.type !== "image" && onSaveProjectDefault ? (
          <div className="mb-3 rounded-md bg-slate-50 px-2.5 py-2">
            <div className="mb-1.5 text-[11px] font-medium text-slate-600">新規オブジェクトの既定スタイル</div>
            <div className="flex flex-wrap gap-1">
              <Button size="sm" variant="secondary" data-testid="project-default-save" onClick={onSaveProjectDefault}>
                選択中を既定に保存
              </Button>
              {hasProjectDefault && onClearProjectDefault ? (
                <Button size="sm" variant="ghost" data-testid="project-default-clear" onClick={onClearProjectDefault}>
                  既定を解除
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
        {editableSelected ? (
          <TypeProperties
            selected={editableSelected}
            annotation={annotation}
            naturalSizes={naturalSizes}
            theme={theme}
            selectedPointIndex={selectedPointIndex}
            setSelectedPointIndex={setSelectedPointIndex}
            updateObject={updateObject}
            updateAt={updateAt}
            updateRect={updateRect}
            updateCrop={updateCrop}
            updatePointValue={updatePointValue}
            updateLineStyle={updateLineStyle}
            updateLineType={updateLineType}
            updateArrowHeads={updateArrowHeads}
            addPoint={addPoint}
            removePoint={removePoint}
            onOpenReplaceImage={onOpenReplaceImage}
            onOpenVisualCrop={onOpenVisualCrop}
            onResetImageSize={onResetImageSize}
            onFitTextHeight={onFitTextHeight}
          />
        ) : null}
      </section>
      <footer className="mt-auto border-t border-slate-100 px-3 py-2.5 text-[11px] leading-relaxed text-slate-500">
        <Kbd>⌘S</Kbd> 保存 ・ <Kbd>⌘Z</Kbd> 取り消し ・ <Kbd>⌘D</Kbd> 複製 ・
        <Kbd>⌘C</Kbd><Kbd>⌘V</Kbd> コピー/貼り付け ・ <Kbd>Delete</Kbd> 削除 ・
        矢印キーで 0.1% 移動(
        <Kbd>⇧</Kbd> で 1%)
      </footer>
    </>
  );
}
