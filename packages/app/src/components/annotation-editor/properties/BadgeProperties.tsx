import type { AnnotationObject } from "@mahomanual/core/schema";
import {
  DEFAULT_ANNOTATION_COLOR,
  DEFAULT_ANNOTATION_FONT_SIZE,
} from "@mahomanual/core/theme";
import { ColorInput } from "../../ui.js";
import { NumberField } from "../helpers.js";
import type { ObjectPanelBaseProps } from "./shared.js";

type BadgeObject = Extract<AnnotationObject, { type: "badge" }>;

interface BadgePropertiesProps extends ObjectPanelBaseProps {
  selected: BadgeObject;
  updateAt: (axis: "x" | "y", value: number) => void;
}

export function BadgeProperties({
  selected,
  theme,
  updateObject,
  updateAt,
}: BadgePropertiesProps) {
  return (
    <div className="space-y-3 text-sm">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">番号 (n)</span>
        <input
          type="number"
          min={1}
          className="h-8 w-full rounded-md border border-slate-300 bg-white px-2.5 text-sm shadow-xs transition-colors duration-150 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          value={selected.n}
          onChange={(event) => {
            const n = Number.parseInt(event.target.value, 10);
            if (Number.isNaN(n) || n < 1) {
              return;
            }
            updateObject(selected.id, (obj) => {
              if (obj.type !== "badge") {
                return obj;
              }
              return { ...obj, n };
            });
          }}
        />
      </label>
      <div>
        <span className="mb-1 block text-xs font-medium text-slate-600">位置 (%)</span>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="x" value={selected.at.x} testId="prop-at-x" onChange={(v) => updateAt("x", v)} />
          <NumberField label="y" value={selected.at.y} testId="prop-at-y" onChange={(v) => updateAt("y", v)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">色</span>
          <ColorInput
            data-testid="prop-color"
            value={selected.color ?? theme.color ?? DEFAULT_ANNOTATION_COLOR}
            onChange={(event) => {
              const color = event.target.value;
              updateObject(selected.id, (obj) =>
                obj.type === "badge" ? { ...obj, color } : obj,
              );
            }}
          />
        </label>
        <div>
          <span className="mb-1 block text-xs font-medium text-slate-600">直径 (px)</span>
          <NumberField
            label=""
            value={selected.size ?? 22}
            step={1}
            min={8}
            onChange={(v) =>
              updateObject(selected.id, (obj) =>
                obj.type === "badge" ? { ...obj, size: Math.max(8, Math.round(v)) } : obj,
              )
            }
          />
        </div>
      </div>
      <div>
        <span className="mb-1 block text-xs font-medium text-slate-600">フォントサイズ (px)</span>
        <NumberField
          label=""
          value={selected.fontSize ?? theme.fontSize ?? DEFAULT_ANNOTATION_FONT_SIZE}
          step={1}
          min={6}
          testId="prop-font-size"
          onChange={(v) =>
            updateObject(selected.id, (obj) =>
              obj.type === "badge" ? { ...obj, fontSize: Math.max(6, Math.round(v)) } : obj,
            )
          }
        />
      </div>
    </div>
  );
}
