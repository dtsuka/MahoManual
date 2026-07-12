import type { AnnotationObject } from "@mahomanual/core/schema";
import { isEditable } from "@mahomanual/core/annotation-objects";
import { IconGrip, IconLock, IconUnlock } from "../icons.js";
import { cx } from "../ui.js";
import { objectIcon, objectLabel } from "./helpers.js";

interface AnnotationObjectListProps {
  objects: AnnotationObject[];
  selectedIds: string[];
  hiddenIds: ReadonlySet<string>;
  soloId: string | null;
  dragListIndex: number | null;
  dropListIndex: number | null;
  onSelect: (id: string, additive: boolean) => void;
  onToggleLock: (id: string) => void;
  onToggleHidden: (id: string) => void;
  onToggleSolo: (id: string) => void;
  onReorder: (from: number, to: number) => void;
  onDragListIndexChange: (index: number | null) => void;
  onDropListIndexChange: (index: number | null) => void;
}

export function AnnotationObjectList({
  objects,
  selectedIds,
  hiddenIds,
  soloId,
  dragListIndex,
  dropListIndex,
  onSelect,
  onToggleLock,
  onToggleHidden,
  onToggleSolo,
  onReorder,
  onDragListIndexChange,
  onDropListIndexChange,
}: AnnotationObjectListProps) {
  return (
    <section className="border-b border-slate-100 p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <h2 className="text-xs font-semibold text-slate-700">オブジェクト</h2>
        {selectedIds.length > 1 ? (
          <span
            className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-800"
            data-testid="selection-count"
          >
            {selectedIds.length}個選択
          </span>
        ) : null}
      </div>
      <p className="mb-2 text-[11px] leading-relaxed text-slate-500">
        前面 → 背面の順。⌘/Ctrl/Shift+クリックで複数選択できます。
      </p>
      <ul className="space-y-0.5">
        {[...objects].reverse().map((obj, displayIndex) => (
          <li
            key={obj.id}
            draggable={isEditable(obj)}
            onDragStart={() => {
              if (isEditable(obj)) {
                onDragListIndexChange(displayIndex);
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
              onDropListIndexChange(displayIndex);
            }}
            onDragLeave={() => {
              if (dropListIndex === displayIndex) {
                onDropListIndexChange(null);
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (dragListIndex !== null) {
                onReorder(dragListIndex, displayIndex);
              }
              onDragListIndexChange(null);
              onDropListIndexChange(null);
            }}
            onDragEnd={() => {
              onDragListIndexChange(null);
              onDropListIndexChange(null);
            }}
            className={cx(
              "relative rounded-md",
              dropListIndex === displayIndex && dragListIndex !== displayIndex &&
                "border-t-2 border-blue-400",
            )}
          >
            <button
              type="button"
              data-testid={`object-item-${obj.id}`}
              className={cx(
                "group flex w-full items-center gap-2 rounded-md border py-1.5 pl-2 pr-16 text-left text-[13px] transition-colors duration-150",
                hiddenIds.has(obj.id) && "opacity-50",
                soloId && soloId !== obj.id && "opacity-40",
                isEditable(obj) ? "cursor-grab" : "cursor-default",
                selectedIds.includes(obj.id)
                  ? "border-blue-400 bg-blue-50 text-blue-800"
                  : "border-transparent text-slate-700 hover:bg-slate-100",
              )}
              onClick={(event) => {
                onSelect(obj.id, event.metaKey || event.ctrlKey || event.shiftKey);
              }}
            >
              <span
                className={cx(
                  "shrink-0",
                  selectedIds.includes(obj.id) ? "text-blue-600" : "text-slate-400",
                )}
              >
                {objectIcon(obj.type)}
              </span>
              <span className="min-w-0 flex-1 truncate">{objectLabel(obj)}</span>
              <span className="shrink-0 font-mono text-[10px] text-slate-500">{obj.id}</span>
              <IconGrip
                size={12}
                className="shrink-0 text-slate-300 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
              />
            </button>
            <div className="absolute right-1 top-1 flex items-center gap-0.5">
              <button
                type="button"
                data-testid={`object-visibility-${obj.id}`}
                className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                title={hiddenIds.has(obj.id) ? "表示する" : "一時的に非表示"}
                onClick={() => onToggleHidden(obj.id)}
              >
                {hiddenIds.has(obj.id) ? "👁‍🗨" : "👁"}
              </button>
              <button
                type="button"
                data-testid={`object-solo-${obj.id}`}
                className={cx(
                  "flex h-6 w-6 items-center justify-center rounded text-[10px]",
                  soloId === obj.id
                    ? "bg-blue-100 text-blue-700"
                    : "text-slate-400 hover:bg-slate-200 hover:text-slate-700",
                )}
                title="単独表示"
                onClick={() => onToggleSolo(obj.id)}
              >
                1
              </button>
              <button
                type="button"
                data-testid={`object-lock-${obj.id}`}
                className={cx(
                  "flex h-6 w-6 items-center justify-center rounded transition-colors",
                  !isEditable(obj)
                    ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                    : "text-slate-400 hover:bg-slate-200 hover:text-slate-700",
                )}
                title={!isEditable(obj) ? "ロックを解除" : "オブジェクトをロック"}
                aria-label={!isEditable(obj) ? `${obj.id}のロックを解除` : `${obj.id}をロック`}
                onClick={() => onToggleLock(obj.id)}
              >
                {!isEditable(obj) ? <IconLock size={12} /> : <IconUnlock size={12} />}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
