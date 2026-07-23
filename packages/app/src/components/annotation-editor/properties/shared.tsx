import type { AnnotationObject } from "@mahomanual/core/schema";
import type { AnnotationTheme } from "@mahomanual/core/theme";
import { NumberField } from "../helpers.js";

export type UpdateObject = (
  objectId: string,
  updater: (obj: AnnotationObject) => AnnotationObject,
) => void;

export type RectKey = "x" | "y" | "w" | "h";

export interface ObjectPanelBaseProps {
  theme: AnnotationTheme;
  updateObject: UpdateObject;
}

export function RectPositionFields({
  rect,
  label,
  onChange,
}: {
  rect: { x: number; y: number; w: number; h: number };
  label: string;
  onChange: (key: RectKey, value: number) => void;
}) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="x" value={rect.x} testId="prop-rect-x" onChange={(v) => onChange("x", v)} />
        <NumberField label="y" value={rect.y} testId="prop-rect-y" onChange={(v) => onChange("y", v)} />
        <NumberField label="w" value={rect.w} min={0.5} testId="prop-rect-w" onChange={(v) => onChange("w", v)} />
        <NumberField label="h" value={rect.h} min={0.5} testId="prop-rect-h" onChange={(v) => onChange("h", v)} />
      </div>
    </div>
  );
}
