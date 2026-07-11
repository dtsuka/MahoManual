import { Button } from "../ui.js";
import { NumberField } from "./helpers.js";

interface CanvasMarginDraft {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface CanvasMarginPanelProps {
  marginDraft: CanvasMarginDraft;
  onChange: (margin: CanvasMarginDraft) => void;
  onApply: () => void;
}

export function CanvasMarginPanel({ marginDraft, onChange, onApply }: CanvasMarginPanelProps) {
  return (
    <section className="border-b border-slate-100 p-3">
      <h2 className="mb-2 text-xs font-semibold text-slate-700">キャンバス余白</h2>
      <p className="mb-2 text-[11px] leading-relaxed text-slate-500">
        画像の外側へ注釈を置くための余白を追加します(負値で削除)。既存オブジェクトの見た目の位置は変わりません。
      </p>
      <div className="mb-2 grid grid-cols-2 gap-1.5">
        <NumberField
          label="上"
          value={marginDraft.top}
          step={10}
          testId="canvas-margin-top"
          onChange={(value) => onChange({ ...marginDraft, top: value })}
        />
        <NumberField
          label="右"
          value={marginDraft.right}
          step={10}
          testId="canvas-margin-right"
          onChange={(value) => onChange({ ...marginDraft, right: value })}
        />
        <NumberField
          label="下"
          value={marginDraft.bottom}
          step={10}
          testId="canvas-margin-bottom"
          onChange={(value) => onChange({ ...marginDraft, bottom: value })}
        />
        <NumberField
          label="左"
          value={marginDraft.left}
          step={10}
          testId="canvas-margin-left"
          onChange={(value) => onChange({ ...marginDraft, left: value })}
        />
      </div>
      <Button size="sm" data-testid="canvas-margin-apply" onClick={onApply}>
        適用
      </Button>
    </section>
  );
}
