import type { AnnotationObject } from "@mahomanual/core/schema";
import { Button } from "../../ui.js";
import { IconImage } from "../../icons.js";
import { NumberField } from "../helpers.js";
import { RectPositionFields, type ObjectPanelBaseProps, type RectKey } from "./shared.js";

type ImageObject = Extract<AnnotationObject, { type: "image" }>;

interface ImagePropertiesProps extends ObjectPanelBaseProps {
  selected: ImageObject;
  naturalSizes: Record<string, { w: number; h: number }>;
  updateRect: (key: RectKey, value: number) => void;
  updateCrop: (key: RectKey, value: number) => void;
  onOpenReplaceImage: () => void;
  onOpenVisualCrop?: () => void;
  onResetImageSize?: () => void;
}

export function ImageProperties({
  selected,
  naturalSizes,
  updateObject,
  updateRect,
  updateCrop,
  onOpenReplaceImage,
  onOpenVisualCrop,
  onResetImageSize,
}: ImagePropertiesProps) {
  return (
    <div className="space-y-3 text-sm">
      <RectPositionFields rect={selected.rect} label="配置 (%)" onChange={updateRect} />
      {onResetImageSize ? (
        <div className="space-y-1">
          <Button
            size="sm"
            variant="secondary"
            className="w-full"
            data-testid="reset-image-size"
            onClick={onResetImageSize}
          >
            元のサイズに戻す
          </Button>
          <p className="text-[11px] leading-relaxed text-slate-500">
            クロップ範囲をキャンバス上で1px=1pxの大きさに戻します。中心位置は維持されます。リサイズ時は Shift で縦横比を維持できます。
          </p>
        </div>
      ) : null}
      {(() => {
        const natural = naturalSizes[selected.src];
        if (!natural) {
          return <p className="text-xs text-red-600">画像サイズを取得できません。</p>;
        }
        const crop = selected.crop ?? { x: 0, y: 0, w: natural.w, h: natural.h };
        return (
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-600">クロップ (画像px)</span>
              <div className="flex items-center gap-1">
                {onOpenVisualCrop ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5 text-[11px]"
                    data-testid="open-visual-crop"
                    onClick={onOpenVisualCrop}
                  >
                    クロップを編集
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-[11px]"
                  onClick={() =>
                    updateObject(selected.id, (obj) =>
                      obj.type === "image"
                        ? { ...obj, crop: { x: 0, y: 0, w: natural.w, h: natural.h } }
                        : obj,
                    )
                  }
                >
                  全体に戻す
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="x" value={crop.x} step={1} min={0} testId="crop-x" onChange={(v) => updateCrop("x", v)} />
              <NumberField label="y" value={crop.y} step={1} min={0} testId="crop-y" onChange={(v) => updateCrop("y", v)} />
              <NumberField label="w" value={crop.w} step={1} min={1} testId="crop-w" onChange={(v) => updateCrop("w", v)} />
              <NumberField label="h" value={crop.h} step={1} min={1} testId="crop-h" onChange={(v) => updateCrop("h", v)} />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              元画像 {natural.w} × {natural.h}px
            </p>
            <Button
              size="sm"
              className="mt-3 w-full"
              data-testid="replace-image-button"
              onClick={onOpenReplaceImage}
            >
              <IconImage size={14} />
              画像ファイルを置換
            </Button>
          </div>
        );
      })()}
    </div>
  );
}
