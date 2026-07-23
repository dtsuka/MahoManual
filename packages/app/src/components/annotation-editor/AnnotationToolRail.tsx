import {
  IconArrowLine,
  IconBadge,
  IconFrame,
  IconImage,
  IconLine,
  IconMosaic,
  IconPointer,
  IconSelect,
  IconType,
} from "../icons.js";
import { IconButton } from "../ui.js";
import type { EditorTool } from "./editor-tool.js";

interface AnnotationToolRailProps {
  activeTool: EditorTool;
  toolClass: (tool: EditorTool) => string;
  onActivateTool: (tool: EditorTool) => void;
  onAddImage: () => void;
}

/**
 * オブジェクト追加ツールレール(キャンバス左端にフロート)。
 * ツール名は SPEC の注釈用語に合わせ、CSS ツールチップで表示する
 */
export function AnnotationToolRail({ activeTool, toolClass, onActivateTool, onAddImage }: AnnotationToolRailProps) {
  return (
    <div className="absolute left-3 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-md">
      <IconButton
        label="選択"
        tip
        data-testid="tool-select"
        aria-pressed={activeTool === "select"}
        className={toolClass("select")}
        onClick={() => onActivateTool("select")}
      >
        <IconSelect />
      </IconButton>
      <div className="my-0.5 h-px bg-slate-200" aria-hidden="true" />
      <IconButton
        label="丸数字"
        tip
        data-testid="add-badge"
        aria-pressed={activeTool === "badge"}
        className={toolClass("badge")}
        onClick={() => onActivateTool("badge")}
      >
        <IconBadge />
      </IconButton>
      <IconButton
        label="テキスト"
        tip
        data-testid="add-text"
        aria-pressed={activeTool === "text"}
        className={toolClass("text")}
        onClick={() => onActivateTool("text")}
      >
        <IconType />
      </IconButton>
      <IconButton
        label="カーソル"
        tip
        data-testid="add-cursor"
        aria-pressed={activeTool === "cursor"}
        className={toolClass("cursor")}
        onClick={() => onActivateTool("cursor")}
      >
        <IconPointer />
      </IconButton>
      <IconButton
        label="強調枠"
        tip
        data-testid="add-frame"
        aria-pressed={activeTool === "frame"}
        className={toolClass("frame")}
        onClick={() => onActivateTool("frame")}
      >
        <IconFrame />
      </IconButton>
      <IconButton
        label="罫線"
        tip
        data-testid="add-line"
        aria-pressed={activeTool === "line"}
        className={toolClass("line")}
        onClick={() => onActivateTool("line")}
      >
        <IconLine />
      </IconButton>
      <IconButton
        label="矢印"
        tip
        data-testid="add-arrow"
        aria-pressed={activeTool === "arrow"}
        className={toolClass("arrow")}
        onClick={() => onActivateTool("arrow")}
      >
        <IconArrowLine />
      </IconButton>
      <IconButton label="画像" tip data-testid="add-image" onClick={onAddImage}>
        <IconImage />
      </IconButton>
      <IconButton
        label="モザイク"
        tip
        data-testid="add-mosaic"
        aria-pressed={activeTool === "mosaic"}
        className={toolClass("mosaic")}
        onClick={() => onActivateTool("mosaic")}
      >
        <IconMosaic />
      </IconButton>
    </div>
  );
}
