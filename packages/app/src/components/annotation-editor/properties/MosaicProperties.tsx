import type { AnnotationFile, AnnotationObject } from "@mahomanual/core/schema";
import { SelectInput } from "../../ui.js";
import { NumberField } from "../helpers.js";
import { RectPositionFields, type ObjectPanelBaseProps, type RectKey } from "./shared.js";

type MosaicObject = Extract<AnnotationObject, { type: "mosaic" }>;

interface MosaicPropertiesProps extends ObjectPanelBaseProps {
  selected: MosaicObject;
  annotation: AnnotationFile;
  updateRect: (key: RectKey, value: number) => void;
}

export function MosaicProperties({
  selected,
  annotation,
  updateObject,
  updateRect,
}: MosaicPropertiesProps) {
  return (
    <div className="space-y-3 text-sm">
      <RectPositionFields rect={selected.rect} label="適用範囲 (%)" onChange={updateRect} />
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">対象画像</span>
        <SelectInput
          data-testid="mosaic-target"
          className="w-full"
          value={selected.targetImageId}
          onChange={(event) => {
            const targetImageId = event.target.value;
            updateObject(selected.id, (obj) =>
              obj.type === "mosaic" ? { ...obj, targetImageId } : obj,
            );
          }}
        >
          {annotation.objects.filter((obj) => obj.type === "image").map((image) => (
            <option key={image.id} value={image.id}>{image.id}</option>
          ))}
        </SelectInput>
      </label>
      <div>
        <span className="mb-1 block text-xs font-medium text-slate-600">モザイクの粗さ (px)</span>
        <NumberField
          label=""
          value={selected.blockSize ?? 12}
          step={1}
          min={2}
          testId="mosaic-block-size"
          onChange={(value) => updateObject(selected.id, (obj) =>
            obj.type === "mosaic" ? { ...obj, blockSize: Math.max(2, Math.round(value)) } : obj,
          )}
        />
      </div>
      <p className="text-xs leading-relaxed text-slate-500">
        納品時に対象画像の画素へ実際に適用されます。元画像はプロジェクト内に非破壊で保持されます。
      </p>
    </div>
  );
}
