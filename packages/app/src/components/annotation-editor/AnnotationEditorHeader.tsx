import { BackToProjectButton } from "../BackToProjectButton.js";
import { IconChevronRight, IconDownload, IconRedo, IconUndo } from "../icons.js";
import { Button, ButtonLink, DirtyBadge, IconButton, Separator, TextInput } from "../ui.js";

interface AnnotationEditorHeaderProps {
  presentation: "page" | "modal";
  project: string;
  annotationId: string;
  neighbors: { prev: string | null; next: string | null };
  nextAnnotationId: string;
  onNextAnnotationIdChange: (value: string) => void;
  dirty: boolean;
  hostMarkdownDirty?: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onRequestNavigation: (target: string | "back") => void;
  onRename: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
}

export function AnnotationEditorHeader({
  presentation,
  project,
  annotationId,
  neighbors,
  nextAnnotationId,
  onNextAnnotationIdChange,
  dirty,
  hostMarkdownDirty,
  canUndo,
  canRedo,
  onRequestNavigation,
  onRename,
  onUndo,
  onRedo,
  onSave,
}: AnnotationEditorHeaderProps) {
  return (
    <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
      <nav className="flex items-center gap-1" aria-label="注釈ナビゲーション">
        {presentation === "modal" ? (
          <Button
            size="sm"
            variant="ghost"
            data-testid="annotation-modal-close"
            onClick={() => onRequestNavigation("back")}
          >
            閉じる
          </Button>
        ) : (
          <BackToProjectButton project={project} onClick={() => onRequestNavigation("back")} />
        )}
        <Separator />
        <Button
          size="sm"
          variant="ghost"
          data-testid="nav-prev-annotation"
          disabled={!neighbors.prev}
          onClick={() => neighbors.prev && onRequestNavigation(neighbors.prev)}
        >
          <IconChevronRight size={14} className="rotate-180" />
          前の注釈
        </Button>
        <Button
          size="sm"
          variant="ghost"
          data-testid="nav-next-annotation"
          disabled={!neighbors.next}
          onClick={() => neighbors.next && onRequestNavigation(neighbors.next)}
        >
          次の注釈
          <IconChevronRight size={14} />
        </Button>
      </nav>
      <h1 id="annotation-editor-title" className="min-w-0 truncate text-[15px] font-semibold tracking-tight">
        {project} / {annotationId}
      </h1>
      <div className="flex items-center gap-1">
        <TextInput
          data-testid="rename-id-input"
          uiSize="sm"
          className="w-40 font-mono"
          value={nextAnnotationId}
          aria-label="画像ID"
          onChange={(event) => onNextAnnotationIdChange(event.target.value)}
        />
        <Button
          size="sm"
          data-testid="rename-id-button"
          disabled={dirty || hostMarkdownDirty || !nextAnnotationId.trim() || nextAnnotationId.trim() === annotationId}
          title={dirty ? "先に変更を保存してください" : hostMarkdownDirty ? "先にマニュアル本文を保存してください" : "画像IDを変更"}
          onClick={onRename}
        >
          ID変更
        </Button>
      </div>
      {dirty ? <DirtyBadge /> : null}
      <div className="ml-auto flex items-center gap-1.5">
        <IconButton
          label="元に戻す (⌘Z)"
          data-testid="undo-button"
          disabled={!canUndo}
          onClick={onUndo}
        >
          <IconUndo />
        </IconButton>
        <IconButton
          label="やり直す (⌘⇧Z)"
          data-testid="redo-button"
          disabled={!canRedo}
          onClick={onRedo}
        >
          <IconRedo />
        </IconButton>
        <Separator />
        <ButtonLink
          size="sm"
          href={`/api/projects/${encodeURIComponent(project)}/annotations/${encodeURIComponent(annotationId)}/image.png`}
          download={`${annotationId}.png`}
          data-testid="download-composed-image"
          aria-disabled={dirty}
          title={dirty ? "先に変更を保存してください" : "画像と注釈を合成したPNGをダウンロード"}
          className={dirty ? "pointer-events-none opacity-40" : ""}
          onClick={(event) => {
            if (dirty) {
              event.preventDefault();
            }
          }}
        >
          <IconDownload size={14} />
          PNG出力
        </ButtonLink>
        <Button
          size="sm"
          variant="primary"
          className="px-4"
          data-testid="save-button"
          onClick={onSave}
        >
          保存
        </Button>
      </div>
    </header>
  );
}
