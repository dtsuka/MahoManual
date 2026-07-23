import type { AnnotationObject } from "@mahomanual/core/schema";
import { DEFAULT_ANNOTATION_COLOR } from "@mahomanual/core/theme";
import { ColorInput } from "../../ui.js";
import { NumberField } from "../helpers.js";
import { RectPositionFields, type ObjectPanelBaseProps, type RectKey } from "./shared.js";

type FrameObject = Extract<AnnotationObject, { type: "frame" }>;

interface FramePropertiesProps extends ObjectPanelBaseProps {
  selected: FrameObject;
  updateRect: (key: RectKey, value: number) => void;
}

export function FrameProperties({
  selected,
  theme,
  updateObject,
  updateRect,
}: FramePropertiesProps) {
  return (
    <div className="space-y-3 text-sm">
      <RectPositionFields rect={selected.rect} label="位置・サイズ (%)" onChange={updateRect} />
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">線色</span>
          <ColorInput
            data-testid="prop-color"
            value={selected.color ?? theme.color ?? DEFAULT_ANNOTATION_COLOR}
            onChange={(event) => {
              const color = event.target.value;
              updateObject(selected.id, (obj) =>
                obj.type === "frame" ? { ...obj, color } : obj,
              );
            }}
          />
        </label>
        <div>
          <span className="mb-1 block text-xs font-medium text-slate-600">線幅 (px)</span>
          <NumberField
            label=""
            value={selected.strokeWidth ?? 2}
            step={1}
            min={1}
            testId="prop-stroke-width"
            onChange={(v) =>
              updateObject(selected.id, (obj) =>
                obj.type === "frame"
                  ? { ...obj, strokeWidth: Math.max(1, Math.round(v)) }
                  : obj,
              )
            }
          />
        </div>
      </div>
      <p className="text-xs leading-relaxed text-slate-500">ドラッグで移動、周囲のハンドルでリサイズできます。Shift+ドラッグで縦横比を維持します。</p>
    </div>
  );
}
