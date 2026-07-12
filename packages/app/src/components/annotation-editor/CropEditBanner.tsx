import type { VisualCropSession } from "../../lib/visual-crop-session.js";
import { Button } from "../ui.js";

interface CropEditBannerProps {
  session: VisualCropSession;
  onResetFull: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function CropEditBanner({
  session,
  onResetFull,
  onCancel,
  onConfirm,
}: CropEditBannerProps) {
  return (
    <div
      className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-2 border-b border-blue-200 bg-blue-50/95 px-3 py-2 shadow-sm backdrop-blur-sm"
      data-testid="crop-edit-banner"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-blue-900">クロップを編集中</p>
        <p className="text-[11px] text-blue-800/80">
          {session.crop.w}×{session.crop.h}px — ハンドルで範囲を調整し、「確定」で反映（Enter / Esc）
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="secondary" data-testid="crop-reset-full" onClick={onResetFull}>
          全体に戻す
        </Button>
        <Button size="sm" variant="secondary" data-testid="crop-cancel" onClick={onCancel}>
          取消
        </Button>
        <Button size="sm" variant="primary" data-testid="crop-confirm" onClick={onConfirm}>
          確定
        </Button>
      </div>
    </div>
  );
}

interface CropEditSideHintProps {
  session: VisualCropSession;
}

export function CropEditSideHint({ session }: CropEditSideHintProps) {
  return (
    <section className="border-b border-slate-100 p-3" data-testid="crop-edit-side-hint">
      <h2 className="mb-1 text-xs font-semibold text-slate-700">プロパティ</h2>
      <p className="text-[12px] leading-relaxed text-slate-600">
        クロップ編集中です。キャンバス上部のバーから「確定」または「取消」してください。
      </p>
      <p className="mt-2 font-mono text-[11px] text-slate-500">
        {session.crop.w} × {session.crop.h} px
        （x:{session.crop.x}, y:{session.crop.y}）
      </p>
    </section>
  );
}
