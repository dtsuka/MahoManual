import type { LineObject } from "@mahomanual/core/annotation-objects";
import { DEFAULT_ANNOTATION_COLOR } from "@mahomanual/core/theme";
import { Button, ColorInput, SelectInput, cx } from "../../ui.js";
import { IconPlus, IconX } from "../../icons.js";
import { NumberField } from "../helpers.js";
import type { ObjectPanelBaseProps } from "./shared.js";

interface LinePropertiesProps extends ObjectPanelBaseProps {
  selected: LineObject;
  selectedPointIndex: number | null;
  setSelectedPointIndex: (index: number | null) => void;
  updatePointValue: (index: number, axis: "x" | "y", value: number) => void;
  updateLineStyle: (patch: { color?: string; strokeWidth?: number }) => void;
  updateLineType: (type: "line" | "arrow") => void;
  updateArrowHeads: (arrowHeads: "start" | "end" | "both") => void;
  addPoint: () => void;
  removePoint: (index: number) => void;
}

export function LineProperties({
  selected,
  theme,
  selectedPointIndex,
  setSelectedPointIndex,
  updatePointValue,
  updateLineStyle,
  updateLineType,
  updateArrowHeads,
  addPoint,
  removePoint,
}: LinePropertiesProps) {
  return (
    <div className="space-y-3 text-sm">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">線種</span>
        <SelectInput
          data-testid="line-type"
          className="w-full"
          value={selected.type}
          onChange={(event) => updateLineType(event.target.value as "line" | "arrow")}
        >
          <option value="line">Line（線）</option>
          <option value="arrow">Arrow（矢印）</option>
        </SelectInput>
      </label>
      {selected.type === "arrow" ? (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">矢印の向き</span>
          <SelectInput
            data-testid="arrow-heads"
            className="w-full"
            value={selected.arrowHeads ?? "end"}
            onChange={(event) => updateArrowHeads(event.target.value as "start" | "end" | "both")}
          >
            <option value="end">終点</option>
            <option value="start">始点</option>
            <option value="both">両方</option>
          </SelectInput>
        </label>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">色</span>
          <ColorInput
            data-testid="prop-color"
            value={selected.color ?? theme.color ?? DEFAULT_ANNOTATION_COLOR}
            onChange={(event) => updateLineStyle({ color: event.target.value })}
          />
        </label>
        <div>
          <span className="mb-1 block text-xs font-medium text-slate-600">太さ (px)</span>
          <NumberField
            label=""
            value={selected.strokeWidth ?? 2}
            step={1}
            min={1}
            testId="prop-stroke-width"
            onChange={(v) => updateLineStyle({ strokeWidth: Math.max(1, Math.round(v)) })}
          />
        </div>
      </div>
      <div>
        <div className="mb-1.5 text-xs font-medium text-slate-600">
          点({selected.points.length})
        </div>
        <ul className="mb-2 space-y-1">
          {selected.points.map((point, index) => (
            <li
              key={index}
              data-testid={`point-row-${index}`}
              className={cx(
                "flex items-center gap-1 rounded-md px-1 py-1 transition-colors duration-150",
                selectedPointIndex === index
                  ? "bg-blue-100 ring-1 ring-blue-300"
                  : "hover:bg-slate-50",
              )}
              onClick={() => setSelectedPointIndex(index)}
            >
              <span className="w-3 shrink-0 text-center text-[11px] text-slate-500">{index + 1}</span>
              <NumberField
                label="x"
                value={point.x}
                testId={`prop-point-${index}-x`}
                onFocus={() => setSelectedPointIndex(index)}
                onChange={(v) => updatePointValue(index, "x", v)}
              />
              <NumberField
                label="y"
                value={point.y}
                onFocus={() => setSelectedPointIndex(index)}
                onChange={(v) => updatePointValue(index, "y", v)}
              />
              <button
                type="button"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 transition-colors duration-150 hover:bg-slate-200 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={selected.points.length <= 2}
                onClick={() => removePoint(index)}
                title="点を削除"
                aria-label="点を削除"
              >
                <IconX size={11} />
              </button>
            </li>
          ))}
        </ul>
        <Button size="sm" onClick={addPoint}>
          <IconPlus size={12} />
          点を追加
        </Button>
      </div>
      <p className="text-xs leading-relaxed text-slate-500">
        線上を Option(Alt)+クリックで点を追加できます。点のドラッグは他の点の x/y
        に自動吸着し、Shift 押下中は隣の点を基準に 45° 刻みでスナップします。
      </p>
    </div>
  );
}
