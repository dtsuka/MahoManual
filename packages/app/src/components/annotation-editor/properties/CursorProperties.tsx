import type { AnnotationObject, CursorIcon } from "@mahomanual/core/schema";
import { DEFAULT_CURSOR_COLOR } from "@mahomanual/core/theme";
import { ColorInput, SelectInput } from "../../ui.js";
import { NumberField } from "../helpers.js";
import type { ObjectPanelBaseProps } from "./shared.js";

type CursorObject = Extract<AnnotationObject, { type: "cursor" }>;

interface CursorPropertiesProps extends ObjectPanelBaseProps {
  selected: CursorObject;
  updateAt: (axis: "x" | "y", value: number) => void;
}

export function CursorProperties({
  selected,
  updateObject,
  updateAt,
}: CursorPropertiesProps) {
  return (
    <div className="space-y-3 text-sm">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">カーソル種類</span>
        <SelectInput
          data-testid="cursor-icon"
          className="w-full"
          value={selected.icon}
          onChange={(event) => {
            const icon = event.target.value as CursorIcon;
            updateObject(selected.id, (obj) =>
              obj.type === "cursor" ? { ...obj, icon } : obj,
            );
          }}
        >
          <option value="pointer">通常 (Pointer)</option>
          <option value="move">移動 (Move)</option>
          <option value="grab">つかむ (Grab)</option>
          <option value="text">テキスト (Text)</option>
          <option value="crosshair">十字 (Crosshair)</option>
        </SelectInput>
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
            value={selected.color ?? DEFAULT_CURSOR_COLOR}
            onChange={(event) => {
              const color = event.target.value;
              updateObject(selected.id, (obj) =>
                obj.type === "cursor" ? { ...obj, color } : obj,
              );
            }}
          />
        </label>
        <div>
          <span className="mb-1 block text-xs font-medium text-slate-600">サイズ (px)</span>
          <NumberField
            label=""
            value={selected.size ?? 28}
            step={1}
            min={8}
            testId="cursor-size"
            onChange={(v) =>
              updateObject(selected.id, (obj) =>
                obj.type === "cursor" ? { ...obj, size: Math.max(8, Math.round(v)) } : obj,
              )
            }
          />
        </div>
      </div>
      <p className="text-xs leading-relaxed text-slate-500">
        SVGはHTMLへ直接埋め込まれるため、単体HTMLでも表示されます。
      </p>
    </div>
  );
}
