import { IconFit, IconMinus, IconPlus } from "../icons.js";
import { Button, IconButton } from "../ui.js";

interface AnnotationZoomControlsProps {
  zoom: number;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onShowActualSize: () => void;
  onShowFit: () => void;
}

export function AnnotationZoomControls({
  zoom,
  onZoomOut,
  onZoomIn,
  onShowActualSize,
  onShowFit,
}: AnnotationZoomControlsProps) {
  return (
    <div className="absolute bottom-3 left-16 z-10 flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-md">
      <IconButton
        label="縮小"
        size="sm"
        data-testid="zoom-out"
        disabled={zoom <= 25}
        onClick={onZoomOut}
      >
        <IconMinus size={14} />
      </IconButton>
      <output
        data-testid="zoom-value"
        className="w-12 text-center font-mono text-[11px] font-medium text-slate-700"
        aria-label="表示倍率"
      >
        {Math.round(zoom)}%
      </output>
      <IconButton
        label="拡大"
        size="sm"
        data-testid="zoom-in"
        disabled={zoom >= 400}
        onClick={onZoomIn}
      >
        <IconPlus size={14} />
      </IconButton>
      <div className="mx-0.5 h-5 w-px bg-slate-200" aria-hidden="true" />
      <Button size="sm" variant="ghost" data-testid="zoom-actual" onClick={onShowActualSize}>
        100%
      </Button>
      <IconButton label="全体表示" size="sm" data-testid="zoom-fit" onClick={onShowFit}>
        <IconFit size={14} />
      </IconButton>
    </div>
  );
}
