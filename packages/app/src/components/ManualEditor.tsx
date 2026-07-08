import { markdown } from "@codemirror/lang-markdown";
import { defaultKeymap } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { annotationThemeCss, THEME_FIGURE_CSS, type AnnotationTheme } from "@mahomanual/core/theme";
import {
  fetchManual,
  fetchPreview,
  renumberAllAnnotations,
  saveManual,
  subscribeProjectWatch,
} from "../lib/api.js";

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
          markdown(),
          keymap.of(defaultKeymap),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) {
              return;
            }
            const value = update.state.doc.toString();
            markdownRef.current = value;
            setMarkdownText(value);
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

  if (markdownText === null) {
    return <div className="p-6">読み込み中…</div>;
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <h1 className="text-lg font-semibold">{project} — マニュアル編集</h1>
        {dirty ? <span className="text-sm text-amber-600">未保存</span> : null}
        <div className="ml-auto flex gap-2">
          <button type="button" className="rounded bg-slate-100 px-3 py-1" onClick={() => void handleRenumber()}>
            Renumber
          </button>
          <button
            type="button"
            className="rounded bg-blue-600 px-4 py-1 text-white"
            data-testid="save-manual"
            onClick={() => void handleSave()}
          >
            保存
          </button>
        </div>
      </header>
      {status ? <div className="bg-green-50 px-4 py-2 text-green-700">{status}</div> : null}
      {warning ? <div className="bg-amber-50 px-4 py-2 text-amber-800">{warning}</div> : null}
      {previewError ? <div className="bg-red-50 px-4 py-2 text-red-700">プレビューエラー: {previewError}</div> : null}
      {externalBody !== null ? (
        <div
          className="flex items-center gap-3 bg-amber-50 px-4 py-2 text-amber-800"
          data-testid="external-change-banner"
        >
          <span>外部で manual.md が変更されました。読み込むと未保存の編集は失われます。</span>
          <button
            type="button"
            className="rounded border border-amber-400 px-2 py-0.5"
            onClick={() => applyExternal(externalBody)}
          >
            外部の内容を読み込む
          </button>
          <button
            type="button"
            className="rounded border border-slate-300 px-2 py-0.5"
            onClick={() => setExternalBody(null)}
          >
            無視する
          </button>
        </div>
      ) : null}
      <div className="grid flex-1 grid-cols-2 divide-x divide-slate-200">
        <div ref={editorHostRef} className="h-full overflow-auto" data-testid="md-editor" />
        <div className="preview-pane h-full overflow-auto bg-white p-4" data-testid="preview-pane">
          <style>{THEME_FIGURE_CSS}</style>
          {annotationThemeCss(previewTheme) ? <style>{annotationThemeCss(previewTheme)}</style> : null}
          <div ref={previewRef} dangerouslySetInnerHTML={{ __html: previewHtml }} />
        </div>
      </div>
    </div>
  );
}
