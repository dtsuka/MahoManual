import { Button } from "../ui.js";

interface AlignmentToolbarProps {
  onAlign: (axis: "horizontal" | "vertical", edge: "start" | "center" | "end") => void;
  onDistribute: (axis: "horizontal" | "vertical") => void;
  onLayerForward: () => void;
  onLayerBackward: () => void;
}

export function AlignmentToolbar({
  onAlign,
  onDistribute,
  onLayerForward,
  onLayerBackward,
}: AlignmentToolbarProps) {
  return (
    <div
      className="pointer-events-auto absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-md"
      data-testid="alignment-toolbar"
    >
      <Button size="sm" variant="ghost" data-testid="align-left" onClick={() => onAlign("horizontal", "start")}>
        左
      </Button>
      <Button size="sm" variant="ghost" data-testid="align-center-h" onClick={() => onAlign("horizontal", "center")}>
        横中央
      </Button>
      <Button size="sm" variant="ghost" data-testid="align-right" onClick={() => onAlign("horizontal", "end")}>
        右
      </Button>
      <Button size="sm" variant="ghost" data-testid="align-top" onClick={() => onAlign("vertical", "start")}>
        上
      </Button>
      <Button size="sm" variant="ghost" data-testid="align-center-v" onClick={() => onAlign("vertical", "center")}>
        縦中央
      </Button>
      <Button size="sm" variant="ghost" data-testid="align-bottom" onClick={() => onAlign("vertical", "end")}>
        下
      </Button>
      <Button size="sm" variant="ghost" data-testid="distribute-h" onClick={() => onDistribute("horizontal")}>
        横等間隔
      </Button>
      <Button size="sm" variant="ghost" data-testid="distribute-v" onClick={() => onDistribute("vertical")}>
        縦等間隔
      </Button>
      <Button size="sm" variant="ghost" data-testid="layer-forward" onClick={onLayerForward}>
        前面
      </Button>
      <Button size="sm" variant="ghost" data-testid="layer-backward" onClick={onLayerBackward}>
        背面
      </Button>
    </div>
  );
}
