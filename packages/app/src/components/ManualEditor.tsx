import { markdown } from "@codemirror/lang-markdown";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { minimalSetup } from "codemirror";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  annotationThemeCss,
  scopeCss,
  THEME_FIGURE_CSS,
  THEME_TYPOGRAPHY_CSS,
  type AnnotationTheme,
} from "@mahomanual/core/theme";
import {
  fetchManual,
  fetchPreview,
  pasteImage,
  renumberAllAnnotations,
  saveManual,
  subscribeProjectWatch,
} from "../lib/api.js";
import { readAsDataUrl, readImageSize } from "../lib/image-data.js";
import {
  formatAnnotatedImageFence,
  formatTocMarker,
  insertEditorText,
} from "../lib/manual-insert.js";
import {
  extractAnnotatedFigures,
  livePreview,
} from "../lib/live-preview.js";
import { BackToProjectButton } from "./BackToProjectButton.js";
import {
  IconDownload,
  IconImage,
  IconList,
  IconRefresh,
} from "./icons.js";
import {
  Banner,
  Button,
  ButtonLink,
  DirtyBadge,
  SelectInput,
  Separator,
  TextInput,
} from "./ui.js";

interface ManualEditorProps {
  project: string;
}

export function ManualEditor({ project }: ManualEditorProps) {
  const [markdownText, setMarkdownText] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewTheme, setPreviewTheme] = useState<AnnotationTheme>({});
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [dirty, setDirty] = useState(false);
  const [annotations, setAnnotations] = useState<string[]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState("");
  const [newImageId, setNewImageId] = useState("");
  const [insertError, setInsertError] = useState<string | null>(null);
  const [insertBusy, setInsertBusy] = useState(false);
  const [showImagePanel, setShowImagePanel] = useState(false);
  const [livePreviewEnabled, setLivePreviewEnabled] = useState(false);
  // 未保存編集中に外部(AI/CLI)からの変更を検知したとき、上書きせず退避して確認を挟む
  const [externalBody, setExternalBody] = useState<string | null>(null);
  const navigate = useNavigate();
  const editorHostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const markdownRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const applyingExternalRef = useRef(false);
  const previewSeqRef = useRef(0);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const livePreviewCompartmentRef = useRef(new Compartment());

  const refreshAnnotations = async () => {
    const manual = await fetchManual(project);
    setAnnotations(manual.annotations);
    if (manual.annotations.length > 0 && !manual.annotations.includes(selectedAnnotationId)) {
      setSelectedAnnotationId(manual.annotations[0] ?? "");
    }
  };

  const markDirty = (value: boolean) => {
    dirtyRef.current = value;
    setDirty(value);
  };

  // キーストローク毎の API 連打と応答順序の逆転を防ぐ
  // (300ms デバウンス+シーケンス番号で古い応答を破棄)
  const schedulePreview = (text: string, immediate = false) => {
    if (previewTimerRef.current !== null) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    const run = () => {
      const seq = ++previewSeqRef.current;
      fetchPreview(project, text)
        .then((result) => {
          if (seq !== previewSeqRef.current) {
            return;
          }
          setPreviewHtml(result.html);
          setPreviewTheme(result.theme ?? {});
          setPreviewError(null);
        })
        .catch((error: unknown) => {
          if (seq !== previewSeqRef.current) {
            return;
          }
          setPreviewError(error instanceof Error ? error.message : "プレビューに失敗しました");
        });
    };
    if (immediate) {
      run();
    } else {
      previewTimerRef.current = setTimeout(run, 300);
    }
  };

  const applyExternal = (body: string) => {
    applyingExternalRef.current = true;
    viewRef.current?.dispatch({
      changes: { from: 0, to: viewRef.current.state.doc.length, insert: body },
    });
    applyingExternalRef.current = false;
    markdownRef.current = body;
    setMarkdownText(body);
    markDirty(false);
    setExternalBody(null);
    schedulePreview(body, true);
  };

  useEffect(() => {
    void fetchManual(project).then((manual) => {
      markdownRef.current = manual.body;
      setMarkdownText(manual.body);
      setAnnotations(manual.annotations);
      setSelectedAnnotationId(manual.annotations[0] ?? "");
      schedulePreview(manual.body, true);
    });
    return () => {
      if (previewTimerRef.current !== null) {
        clearTimeout(previewTimerRef.current);
      }
    };
  }, [project]);

  useEffect(() => {
    if (!editorHostRef.current || markdownText === null) {
      return;
    }
    const view = new EditorView({
      state: EditorState.create({
        doc: markdownText,
        extensions: [
          minimalSetup,
          markdown(),
          EditorView.lineWrapping,
          livePreviewCompartmentRef.current.of([]),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) {
              return;
            }
            const value = update.state.doc.toString();
            markdownRef.current = value;
            if (!applyingExternalRef.current) {
              markDirty(true);
            }
            schedulePreview(value);
          }),
        ],
      }),
      parent: editorHostRef.current,
    });
    viewRef.current = view;
    return () => view.destroy();
  }, [project, markdownText === null]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    const extension = livePreviewEnabled
      ? livePreview({
          figures: extractAnnotatedFigures(previewHtml),
          onOpenAnnotation: (annotationId) => {
            navigate(`/projects/${project}/annotations/${encodeURIComponent(annotationId)}`);
          },
        })
      : [];
    view.dispatch({
      effects: livePreviewCompartmentRef.current.reconfigure(extension),
    });
  }, [livePreviewEnabled, previewHtml, project, navigate]);

  useEffect(() => {
    return subscribeProjectWatch(project, (event) => {
      if (event.path !== "manual.md") {
        return;
      }
      void fetchManual(project).then((manual) => {
        // 自分の保存によるエコーは無視する
        if (manual.body === markdownRef.current) {
          return;
        }
        if (dirtyRef.current) {
          setExternalBody(manual.body);
          return;
        }
        applyExternal(manual.body);
      });
    });
  }, [project]);

  useEffect(() => {
    const container = previewRef.current;
    if (!container) {
      return;
    }
    const handler = (event: MouseEvent) => {
      const figure = (event.target as HTMLElement).closest<HTMLElement>("figure[data-mm-annotation]");
      if (!figure?.dataset.mmAnnotation) {
        return;
      }
      // ルート遷移にすることで、戻ったときに ManualEditor が再マウントされ
      // CodeMirror が正しく再生成される(条件付き return での差し替えは不可)
      navigate(`/projects/${project}/annotations/${encodeURIComponent(figure.dataset.mmAnnotation)}`);
    };
    container.addEventListener("click", handler);
    return () => container.removeEventListener("click", handler);
  }, [previewHtml, project, navigate]);

  const handleSave = async () => {
    const value = markdownRef.current;
    if (value === null) {
      return;
    }
    await saveManual(project, value);
    markDirty(false);
    setStatus("manual.md を保存しました");
    setTimeout(() => setStatus(""), 2000);
  };

  const handleRenumber = async () => {
    const result = await renumberAllAnnotations(project);
    setWarning(result.warning);
    if (!result.warning) {
      setStatus(`全注釈の badge を振り直しました(合計 ${result.totalBadges} 個)`);
      setTimeout(() => setStatus(""), 3000);
    }
  };

  const handleInsertToc = () => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    setInsertError(null);
    insertEditorText(view, formatTocMarker());
  };

  const handleInsertExistingImage = () => {
    const view = viewRef.current;
    if (!view || !selectedAnnotationId) {
      setInsertError("挿入する画像を選択してください");
      return;
    }
    setInsertError(null);
    insertEditorText(view, formatAnnotatedImageFence(selectedAnnotationId));
    setShowImagePanel(false);
  };

  const handleImportAndInsertImage = async (file: Blob) => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    const id = newImageId.trim() || `img-${Date.now()}`;
    if (/[/\\]/.test(id) || id.includes("..")) {
      setInsertError("ID にパス区切りや .. は使えません");
      return;
    }
    setInsertBusy(true);
    setInsertError(null);
    try {
      const dataUrl = await readAsDataUrl(file);
      const size = await readImageSize(dataUrl);
      await pasteImage(project, id, dataUrl, size.width, size.height);
      insertEditorText(view, formatAnnotatedImageFence(id));
      setNewImageId("");
      setShowImagePanel(false);
      await refreshAnnotations();
      setSelectedAnnotationId(id);
    } catch (error) {
      setInsertError(error instanceof Error ? error.message : "画像の取り込みに失敗しました");
    } finally {
      setInsertBusy(false);
    }
  };

  if (markdownText === null) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-slate-500">
        読み込み中…
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <BackToProjectButton project={project} />
        <div className="flex min-w-0 items-baseline gap-1.5">
          <h1 className="truncate text-[15px] font-semibold tracking-tight">{project}</h1>
          <span className="shrink-0 text-slate-300">/</span>
          <span className="shrink-0 text-[13px] font-medium text-slate-500">マニュアル編集</span>
        </div>
        {dirty ? <DirtyBadge /> : null}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button size="sm" data-testid="insert-toc" onClick={handleInsertToc}>
            <IconList size={14} />
            目次挿入
          </Button>
          <Button
            size="sm"
            variant={livePreviewEnabled ? "primary" : "secondary"}
            data-testid="live-preview-toggle"
            aria-pressed={livePreviewEnabled}
            onClick={() => setLivePreviewEnabled((current) => !current)}
          >
            ライブプレビュー
          </Button>
          <Button
            size="sm"
            data-testid="insert-image"
            onClick={() => {
              setInsertError(null);
              setShowImagePanel((current) => !current);
            }}
          >
            <IconImage size={14} />
            画像挿入
          </Button>
          <Button
            size="sm"
            title="全注釈の badge 番号を出現順に振り直す"
            onClick={() => void handleRenumber()}
          >
            <IconRefresh size={14} />
            番号振り直し
          </Button>
          <Separator />
          <ButtonLink
            size="sm"
            href={`/api/projects/${encodeURIComponent(project)}/export.html`}
            download={`${project}.html`}
            data-testid="export-html"
          >
            <IconDownload size={14} />
            HTML出力
          </ButtonLink>
          <ButtonLink
            size="sm"
            href={`/api/projects/${encodeURIComponent(project)}/export.pdf`}
            download={`${project}.pdf`}
            data-testid="export-pdf"
          >
            <IconDownload size={14} />
            PDF出力
          </ButtonLink>
          <Separator />
          <Button size="sm" variant="primary" className="px-4" data-testid="save-manual" onClick={() => void handleSave()}>
            保存
          </Button>
        </div>
      </header>
      {status ? <Banner kind="success">{status}</Banner> : null}
      {warning ? <Banner kind="warning">{warning}</Banner> : null}
      {previewError ? <Banner kind="danger">プレビューエラー: {previewError}</Banner> : null}
      {showImagePanel ? (
        <div
          className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2"
          data-testid="insert-image-panel"
        >
          <span className="text-xs font-medium text-slate-600">既存:</span>
          <SelectInput
            data-testid="insert-image-select"
            uiSize="sm"
            className="w-44"
            aria-label="挿入する既存画像"
            value={selectedAnnotationId}
            onChange={(event) => setSelectedAnnotationId(event.target.value)}
          >
            {annotations.length === 0 ? (
              <option value="">(画像なし)</option>
            ) : (
              annotations.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))
            )}
          </SelectInput>
          <Button
            size="sm"
            data-testid="insert-image-existing"
            disabled={!selectedAnnotationId}
            onClick={handleInsertExistingImage}
          >
            挿入
          </Button>
          <Separator />
          <TextInput
            data-testid="insert-image-id"
            uiSize="sm"
            className="w-40"
            placeholder="新規ID(空なら自動)"
            value={newImageId}
            onChange={(event) => setNewImageId(event.target.value)}
          />
          <Button
            size="sm"
            data-testid="insert-image-new"
            disabled={insertBusy}
            onClick={() => imageInputRef.current?.click()}
          >
            新規画像を選択
          </Button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void handleImportAndInsertImage(file);
              }
              event.target.value = "";
            }}
          />
          {insertBusy ? <span className="text-xs text-slate-500">取り込み中…</span> : null}
          {insertError ? (
            <span className="text-xs text-red-600" role="alert">
              {insertError}
            </span>
          ) : null}
        </div>
      ) : null}
      {externalBody !== null ? (
        <Banner kind="warning" testId="external-change-banner">
          <span className="min-w-0 flex-1">
            外部で manual.md が変更されました。読み込むと未保存の編集は失われます。
          </span>
          <Button size="sm" onClick={() => applyExternal(externalBody)}>
            外部の内容を読み込む
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setExternalBody(null)}>
            無視する
          </Button>
        </Banner>
      ) : null}
      <div className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-slate-200">
        <section className="flex min-h-0 flex-col">
          <div className="flex h-7 shrink-0 items-center border-b border-slate-100 bg-white px-4 text-[11px] font-medium text-slate-500">
            Markdown
          </div>
          <div
            ref={editorHostRef}
            className="min-h-0 flex-1 overflow-hidden"
            data-testid="md-editor"
            data-live-preview={livePreviewEnabled}
          />
        </section>
        <section className="flex min-h-0 flex-col bg-slate-100">
          <div className="flex h-7 shrink-0 items-center border-b border-slate-200/70 bg-slate-100 px-4 text-[11px] font-medium text-slate-500">
            プレビュー
          </div>
          <div className="preview-pane min-h-0 flex-1 overflow-auto p-6" data-testid="preview-pane">
            <style>{scopeCss(THEME_TYPOGRAPHY_CSS, ".preview-pane")}</style>
            <style>{THEME_FIGURE_CSS}</style>
            {annotationThemeCss(previewTheme) ? <style>{annotationThemeCss(previewTheme)}</style> : null}
            <div className="mx-auto max-w-[860px] rounded-sm bg-white px-10 py-10 shadow-sm ring-1 ring-slate-900/5">
              <div ref={previewRef} dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
