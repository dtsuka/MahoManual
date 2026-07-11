import type { AnnotationFile, AnnotationObject, CursorIcon } from "@mahomanual/core/schema";
import { isEditable, isLineObject } from "@mahomanual/core/annotation-objects";
import {
  DEFAULT_ANNOTATION_COLOR,
  DEFAULT_ANNOTATION_FONT_SIZE,
  DEFAULT_CURSOR_COLOR,
  type AnnotationTheme,
} from "@mahomanual/core/theme";
import { IconImage, IconPlus, IconX } from "../icons.js";
import { Button, ColorInput, Kbd, SelectInput, cx } from "../ui.js";
import { NumberField } from "./helpers.js";

interface AnnotationPropertiesProps {
  selected: AnnotationObject | null;
  annotation: AnnotationFile;
  naturalSizes: Record<string, { w: number; h: number }>;
  theme: AnnotationTheme;
  selectedPointIndex: number | null;
  setSelectedPointIndex: (index: number | null) => void;
  updateObject: (objectId: string, updater: (obj: AnnotationObject) => AnnotationObject) => void;
  updateAt: (key: "x" | "y", value: number) => void;
  updateRect: (key: "x" | "y" | "w" | "h", value: number) => void;
  updateCrop: (key: "x" | "y" | "w" | "h", value: number) => void;
  updateLineType: (type: "line" | "arrow") => void;
  updateLineStyle: (patch: { color?: string; strokeWidth?: number }) => void;
  updateArrowHeads: (arrowHeads: "start" | "end" | "both") => void;
  updatePointValue: (index: number, key: "x" | "y", value: number) => void;
  addPoint: () => void;
  removePoint: (index: number) => void;
  onOpenReplaceImage: () => void;
}

function RectPositionFields({
  rect,
  label,
  onChange,
}: {
  rect: { x: number; y: number; w: number; h: number };
  label: string;
  onChange: (key: "x" | "y" | "w" | "h", value: number) => void;
}) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="x" value={rect.x} testId="prop-rect-x" onChange={(v) => onChange("x", v)} />
        <NumberField label="y" value={rect.y} testId="prop-rect-y" onChange={(v) => onChange("y", v)} />
        <NumberField label="w" value={rect.w} min={0.5} onChange={(v) => onChange("w", v)} />
        <NumberField label="h" value={rect.h} min={0.5} onChange={(v) => onChange("h", v)} />
      </div>
    </div>
  );
}

export function AnnotationProperties({
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
  updateLineType,
  updateLineStyle,
  updateArrowHeads,
  updatePointValue,
  addPoint,
  removePoint,
  onOpenReplaceImage,
}: AnnotationPropertiesProps) {
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
        {selected?.type === "badge" ? (
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
        ) : null}
        {selected?.type === "text" ? (
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
            <div>
              <span className="mb-1 block text-xs font-medium text-slate-600">位置 (%)</span>
              <div className="grid grid-cols-2 gap-2">
                <NumberField label="x" value={selected.at.x} testId="prop-at-x" onChange={(v) => updateAt("x", v)} />
                <NumberField label="y" value={selected.at.y} testId="prop-at-y" onChange={(v) => updateAt("y", v)} />
              </div>
            </div>
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
        ) : null}
        {selected?.type === "cursor" ? (
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
        ) : null}
        {selected?.type === "frame" ? (
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
            <p className="text-xs leading-relaxed text-slate-500">ドラッグで移動、周囲のハンドルでリサイズできます。</p>
          </div>
        ) : null}
        {selected?.type === "image" ? (
          <div className="space-y-3 text-sm">
            <RectPositionFields rect={selected.rect} label="配置 (%)" onChange={updateRect} />
            {(() => {
              const natural = naturalSizes[selected.src];
              if (!natural) {
                return <p className="text-xs text-red-600">画像サイズを取得できません。</p>;
              }
              const crop = selected.crop ?? { x: 0, y: 0, w: natural.w, h: natural.h };
              return (
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-600">クロップ (画像px)</span>
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
        ) : null}
        {selected?.type === "mosaic" ? (
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
        ) : null}
        {selected && isLineObject(selected) ? (
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
        ) : null}
      </section>
      <footer className="mt-auto border-t border-slate-100 px-3 py-2.5 text-[11px] leading-relaxed text-slate-500">
        <Kbd>⌘Z</Kbd> 取り消し ・ <Kbd>⌘C</Kbd>
        <Kbd>⌘V</Kbd> 複製 ・ <Kbd>Delete</Kbd> 削除 ・ 矢印キーで 0.1% 移動(
        <Kbd>⇧</Kbd> で 1%)
      </footer>
    </>
  );
}
