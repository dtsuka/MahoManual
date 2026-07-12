import type { ObjectConflict } from "@mahomanual/core/merge-annotation-edits";
import { Button } from "../ui.js";

const REASON_LABEL: Record<ObjectConflict["reason"], string> = {
  both_modified: "GUIと外部の両方で内容が変更されています。",
  local_deleted_remote_modified: "GUIでは削除され、外部では内容が変更されています。",
  local_modified_remote_deleted: "GUIでは内容が変更され、外部では削除されています。",
  order_conflict: "GUIと外部で描画順が異なります。",
  canvas_conflict: "GUIと外部でキャンバスサイズが異なります。",
};

function conflictLabel(conflict: ObjectConflict): string {
  if (conflict.id === "(order)") {
    return "描画順";
  }
  if (conflict.id === "(canvas)") {
    return "キャンバス";
  }
  return conflict.id;
}

interface MergeConflictResolverProps {
  conflicts: ObjectConflict[];
  resolutions: Record<string, "local" | "remote">;
  onResolutionChange: (id: string, choice: "local" | "remote") => void;
  onApply: () => void;
  onKeepLocal: () => void;
}

export function MergeConflictResolver({
  conflicts,
  resolutions,
  onResolutionChange,
  onApply,
  onKeepLocal,
}: MergeConflictResolverProps) {
  if (conflicts.length === 0) {
    return null;
  }
  return (
    <div
      className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
      data-testid="merge-conflict-dialog"
      role="region"
      aria-label="外部変更の競合解決"
    >
      <p className="mb-2 font-medium">外部変更と競合しました。オブジェクトごとに採用する版を選んでください。</p>
      <ul className="space-y-2">
        {conflicts.map((conflict) => (
          <li key={conflict.id} className="rounded border border-amber-200 bg-white px-3 py-2">
            <div className="font-mono text-xs font-semibold">{conflictLabel(conflict)}</div>
            <p className="mb-2 mt-0.5 text-xs text-amber-800">{REASON_LABEL[conflict.reason]}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={resolutions[conflict.id] === "local" ? "primary" : "ghost"}
                data-testid={`merge-keep-local-${conflict.id}`}
                onClick={() => onResolutionChange(conflict.id, "local")}
              >
                GUI版
              </Button>
              <Button
                size="sm"
                variant={resolutions[conflict.id] === "remote" ? "primary" : "ghost"}
                data-testid={`merge-keep-remote-${conflict.id}`}
                onClick={() => onResolutionChange(conflict.id, "remote")}
              >
                外部版
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" data-testid="merge-apply" onClick={onApply}>
          解決して反映
        </Button>
        <Button size="sm" variant="ghost" onClick={onKeepLocal}>
          GUIの内容を維持
        </Button>
      </div>
    </div>
  );
}
