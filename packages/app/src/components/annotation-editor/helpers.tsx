import type { AnnotationObject } from "@mahomanual/core/schema";
import {
  IconArrowLine,
  IconBadge,
  IconFrame,
  IconImage,
  IconLine,
  IconMosaic,
  IconPointer,
  IconType,
} from "../icons.js";

export function readImageFile(file: File): Promise<{ data: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
    reader.onload = () => {
      const data = reader.result as string;
      const image = new Image();
      image.onerror = () => reject(new Error("画像サイズを取得できません"));
      image.onload = () => resolve({
        data,
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
      image.src = data;
    };
    reader.readAsDataURL(file);
  });
}

export const FRAME_HANDLES = [
  { dir: "nw", fx: 0, fy: 0, cursor: "nwse-resize" },
  { dir: "n", fx: 0.5, fy: 0, cursor: "ns-resize" },
  { dir: "ne", fx: 1, fy: 0, cursor: "nesw-resize" },
  { dir: "e", fx: 1, fy: 0.5, cursor: "ew-resize" },
  { dir: "se", fx: 1, fy: 1, cursor: "nwse-resize" },
  { dir: "s", fx: 0.5, fy: 1, cursor: "ns-resize" },
  { dir: "sw", fx: 0, fy: 1, cursor: "nesw-resize" },
  { dir: "w", fx: 0, fy: 0.5, cursor: "ew-resize" },
] as const;

export function NumberField({
  label,
  value,
  onChange,
  testId,
  step = 0.1,
  min,
  onFocus,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  testId?: string;
  step?: number;
  min?: number;
  onFocus?: () => void;
}) {
  return (
    <label className="flex h-7 min-w-0 flex-1 items-center gap-1 rounded-md border border-slate-300 bg-white px-1.5 shadow-xs transition-colors duration-150 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500/20">
      {label ? (
        <span className="w-3 shrink-0 text-[11px] font-medium text-slate-500">{label}</span>
      ) : null}
      <input
        type="number"
        step={step}
        min={min}
        data-testid={testId}
        className="h-full w-full min-w-0 bg-transparent text-[13px] text-slate-900 outline-none"
        value={Math.round(value * 100) / 100}
        onFocus={onFocus}
        onChange={(event) => {
          const next = Number.parseFloat(event.target.value);
          if (!Number.isNaN(next)) {
            onChange(next);
          }
        }}
      />
    </label>
  );
}

export function objectLabel(obj: AnnotationObject): string {
  switch (obj.type) {
    case "badge":
      return `badge ${obj.n}`;
    case "text":
      return `text 「${obj.content.slice(0, 8)}${obj.content.length > 8 ? "…" : ""}」`;
    case "cursor":
      return `cursor ${obj.icon}`;
    case "image":
      return `image ${obj.src.split("/").pop() ?? obj.src}`;
    case "frame":
      return "frame";
    case "mosaic":
      return `mosaic → ${obj.targetImageId}`;
    case "line":
      return "line";
    case "arrow":
      return "arrow";
    default: {
      const _exhaustive: never = obj;
      return _exhaustive;
    }
  }
}

export function objectIcon(type: AnnotationObject["type"], size = 14) {
  switch (type) {
    case "badge":
      return <IconBadge size={size} />;
    case "text":
      return <IconType size={size} />;
    case "cursor":
      return <IconPointer size={size} />;
    case "image":
      return <IconImage size={size} />;
    case "frame":
      return <IconFrame size={size} />;
    case "mosaic":
      return <IconMosaic size={size} />;
    case "line":
      return <IconLine size={size} />;
    case "arrow":
      return <IconArrowLine size={size} />;
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}
