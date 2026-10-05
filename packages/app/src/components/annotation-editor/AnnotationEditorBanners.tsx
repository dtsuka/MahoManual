import type { ObjectConflict } from "@mahomanual/core/merge-annotation-edits";
import { Banner, Button } from "../ui.js";
import { MergeConflictResolver } from "./MergeConflictResolver.js";

interface AnnotationEditorBannersProps {
  status: string;
  /** 保存・画像追加など操作の失敗。編集画面は残したまま閉じられる通知で出す */
  operationError: string;
  onDismissOperationError: () => void;
  hasExternalPayload: boolean;
  onApplyExternal: () => void;
  onDismissExternal: () => void;
  pendingNavigation: string | "back" | null;
  onSaveAndNavigate: () => void;
  onDiscardAndNavigate: () => void;
  onCancelNavigation: () => void;
  mergeConflicts: ObjectConflict[];
  mergeResolutions: Record<string, "local" | "remote">;
  onMergeResolutionChange: (id: string, choice: "local" | "remote") => void;
  onApplyMerge: () => void;
  onKeepLocalMerge: () => void;
}

/**
 * キャンバス上部にフロートする通知群(保存状態・外部変更・未保存離脱・マージ競合)。
 */
export function AnnotationEditorBanners({
  status,
  operationError,
  onDismissOperationError,
  hasExternalPayload,
  onApplyExternal,
  onDismissExternal,
  pendingNavigation,
  onSaveAndNavigate,
  onDiscardAndNavigate,
  onCancelNavigation,
  mergeConflicts,
  mergeResolutions,
  onMergeResolutionChange,
  onApplyMerge,
  onKeepLocalMerge,
}: AnnotationEditorBannersProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex flex-col">
      {status ? (
        <div className="pointer-events-auto">
          <Banner kind="success">{status}</Banner>
        </div>
      ) : null}
      {operationError ? (
        <div className="pointer-events-auto">
          <Banner kind="danger" testId="operation-error-banner" role="alert">
            <span className="min-w-0 flex-1">{operationError}</span>
            <Button
              size="sm"
              variant="ghost"
              data-testid="dismiss-operation-error"
              onClick={onDismissOperationError}
            >
              閉じる
            </Button>
          </Banner>
        </div>
      ) : null}
      {hasExternalPayload ? (
        <div className="pointer-events-auto">
          <Banner kind="warning" testId="external-change-banner">
            <span className="min-w-0 flex-1">
              外部で注釈が変更されました。読み込むと未保存の編集は失われます。
            </span>
            <Button size="sm" data-testid="apply-external" onClick={onApplyExternal}>
              外部の内容を読み込む
            </Button>
            <Button size="sm" variant="ghost" onClick={onDismissExternal}>
              GUIの内容を維持
            </Button>
          </Banner>
        </div>
      ) : null}
      {pendingNavigation ? (
        <div className="pointer-events-auto">
          <Banner kind="warning" testId="unsaved-nav-banner">
            <span className="min-w-0 flex-1">未保存の変更があります。移動方法を選んでください。</span>
            <Button size="sm" data-testid="nav-save-and-go" onClick={onSaveAndNavigate}>
              保存して移動
            </Button>
            <Button size="sm" variant="ghost" data-testid="nav-discard-and-go" onClick={onDiscardAndNavigate}>
              破棄して移動
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancelNavigation}>
              キャンセル
            </Button>
          </Banner>
        </div>
      ) : null}
      {mergeConflicts.length > 0 ? (
        <div className="pointer-events-auto">
          <MergeConflictResolver
            conflicts={mergeConflicts}
            resolutions={mergeResolutions}
            onResolutionChange={onMergeResolutionChange}
            onApply={onApplyMerge}
            onKeepLocal={onKeepLocalMerge}
          />
        </div>
      ) : null}
    </div>
  );
}
