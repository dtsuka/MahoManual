import { editableRect } from "@mahomanual/core/annotation-objects";
import type { AnnotationObject } from "@mahomanual/core/schema";
import {
  DEFAULT_ANNOTATION_COLOR,
  DEFAULT_ANNOTATION_FONT_SIZE,
} from "@mahomanual/core/theme";
import { Button, ColorInput, SelectInput } from "../../ui.js";
import { NumberField } from "../helpers.js";
import { RectPositionFields, type ObjectPanelBaseProps, type RectKey } from "./shared.js";

type TextObject = Extract<AnnotationObject, { type: "text" }>;

interface TextPropertiesProps extends ObjectPanelBaseProps {
  selected: TextObject;
  updateRect: (key: RectKey, value: number) => void;
  onFitTextHeight?: () => void;
}

export function TextProperties({
  selected,
  theme,
  updateObject,
  updateRect,
  onFitTextHeight,
}: TextPropertiesProps) {
  return (
    <div className="space-y-3 text-sm">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">テキスト内容</span>
        <textarea
          className="min-h-24 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] shadow-xs transition-colors duration-150 placeholder:text-slate-500 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          value={selected.content}
          onChange={(event) => {
            const content = event.target.value;
            updateObject(selected.id, (obj) => {
              if (obj.type !== "text") {
                return obj;
              }
              return { ...obj, content };
            });
          }}
        />
      </label>
      <RectPositionFields
        rect={editableRect(selected)}
        label="テキストボックス (%)"
        onChange={updateRect}
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">横位置</span>
          <SelectInput
            data-testid="text-align"
            className="w-full"
            value={selected.textAlign ?? "left"}
            onChange={(event) => {
              const textAlign = event.target.value as "left" | "center" | "right";
              updateObject(selected.id, (obj) =>
                obj.type === "text" ? { ...obj, textAlign } : obj,
              );
            }}
          >
            <option value="left">左揃え</option>
            <option value="center">中央揃え</option>
            <option value="right">右揃え</option>
          </SelectInput>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">縦位置</span>
          <SelectInput
            data-testid="vertical-align"
            className="w-full"
            value={selected.verticalAlign ?? "top"}
            onChange={(event) => {
              const verticalAlign = event.target.value as "top" | "middle" | "bottom";
              updateObject(selected.id, (obj) =>
                obj.type === "text" ? { ...obj, verticalAlign } : obj,
              );
            }}
          >
            <option value="top">上揃え</option>
            <option value="middle">中央揃え</option>
            <option value="bottom">下揃え</option>
          </SelectInput>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className="mb-1 block text-xs font-medium text-slate-600">内側余白 (px)</span>
          <NumberField
            label=""
            value={selected.padding ?? 0}
            min={0}
            step={1}
            testId="text-padding"
            onChange={(v) =>
              updateObject(selected.id, (obj) =>
                obj.type === "text" ? { ...obj, padding: Math.max(0, Math.round(v)) } : obj,
              )
            }
          />
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">ボーダー色</span>
          <ColorInput
            data-testid="prop-border-color"
            value={selected.borderColor ?? theme.color ?? DEFAULT_ANNOTATION_COLOR}
            onChange={(event) => {
              const borderColor = event.target.value;
              updateObject(selected.id, (obj) =>
                obj.type === "text" ? { ...obj, borderColor } : obj,
              );
            }}
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className="mb-1 block text-xs font-medium text-slate-600">ボーダー幅 (px)</span>
          <NumberField
            label=""
            value={selected.borderWidth ?? 0}
            min={0}
            step={1}
            testId="border-width"
            onChange={(v) =>
              updateObject(selected.id, (obj) =>
                obj.type === "text" ? { ...obj, borderWidth: Math.max(0, Math.round(v)) } : obj,
              )
            }
          />
        </div>
        <div>
          <span className="mb-1 block text-xs font-medium text-slate-600">角丸 (px)</span>
          <NumberField
            label=""
            value={selected.borderRadius ?? 0}
            min={0}
            step={1}
            testId="border-radius"
            onChange={(v) =>
              updateObject(selected.id, (obj) =>
                obj.type === "text" ? { ...obj, borderRadius: Math.max(0, Math.round(v)) } : obj,
              )
            }
          />
        </div>
      </div>
      {onFitTextHeight ? (
        <Button
          size="sm"
          variant="secondary"
          data-testid="fit-text-height"
          onClick={onFitTextHeight}
        >
          内容に合わせて高さを調整
        </Button>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">文字色</span>
          <ColorInput
            data-testid="prop-color"
            value={selected.color ?? theme.color ?? DEFAULT_ANNOTATION_COLOR}
            onChange={(event) => {
              const color = event.target.value;
              updateObject(selected.id, (obj) =>
                obj.type === "text" ? { ...obj, color } : obj,
              );
            }}
          />
        </label>
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
                obj.type === "text" ? { ...obj, fontSize: Math.max(6, Math.round(v)) } : obj,
              )
            }
          />
        </div>
      </div>
    </div>
  );
}
