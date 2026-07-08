import { markdown } from "@codemirror/lang-markdown";
import { defaultKeymap } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { useEffect, useRef, useState } from "react";
import { THEME_FIGURE_CSS } from "@mahomanual/core/theme";
import {
  fetchManual,
  fetchPreview,
  renumberAnnotation,
  saveManual,
  subscribeProjectWatch,
} from "../lib/api.js";
import { AnnotationEditor } from "./AnnotationEditor.js";

interface ManualEditorProps {
  project: string;
}

export function ManualEditor({ project }: ManualEditorProps) {
  const [markdownText, setMarkdownText] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState("");
  const [warning, setWarning] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [annotationId, setAnnotationId] = useState<string | null>(null);
  const editorHostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const refreshPreview = async (text: string) => {
    const result = await fetchPreview(project, text);
    setPreviewHtml(result.html);
  };

  useEffect(() => {
    void fetchManual(project).then((manual) => {
      setMarkdownText(manual.body);
      void refreshPreview(manual.body);
    });
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
            if (update.docChanged) {
              const value = update.state.doc.toString();
              setMarkdownText(value);
              void refreshPreview(value);
            }
          }),
        ],
      }),
      parent: editorHostRef.current,
    });
    viewRef.current = view;
    return () => view.destroy();
  }, [project, markdownText === null]);

  useEffect(() => {
    const unsubscribe = subscribeProjectWatch(project, (event) => {
      if (event.path === "manual.md") {
        void fetchManual(project).then((manual) => {
          setMarkdownText(manual.body);
          void refreshPreview(manual.body);
          if (viewRef.current) {
            viewRef.current.dispatch({
              changes: {
                from: 0,
                to: viewRef.current.state.doc.length,
                insert: manual.body,
              },
            });
          }
        });
      }
    });
    return unsubscribe;
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
      setAnnotationId(figure.dataset.mmAnnotation);
    };
    container.addEventListener("click", handler);
    return () => container.removeEventListener("click", handler);
  }, [previewHtml]);

  const handleSave = async () => {
    if (markdownText === null) {
      return;
    }
    await saveManual(project, markdownText);
    setStatus("manual.md を保存しました");
    setTimeout(() => setStatus(""), 2000);
  };

  const handleRenumber = async () => {
    const manual = await fetchManual(project);
    const firstAnnotation = manual.annotations[0];
    if (!firstAnnotation) {
      setWarning("注釈がありません");
      return;
    }
    const result = await renumberAnnotation(project, firstAnnotation);
    setWarning(result.warning);
  };

  if (annotationId) {
    return (
      <AnnotationEditor
        project={project}
        annotationId={annotationId}
        onBack={() => setAnnotationId(null)}
      />
    );
  }

  if (markdownText === null) {
    return <div className="p-6">読み込み中…</div>;
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <h1 className="text-lg font-semibold">{project} — マニュアル編集</h1>
        <div className="ml-auto flex gap-2">
          <button type="button" className="rounded bg-slate-100 px-3 py-1" onClick={() => void handleRenumber()}>
            Renumber
          </button>
          <button type="button" className="rounded bg-blue-600 px-4 py-1 text-white" onClick={() => void handleSave()}>
            保存
          </button>
        </div>
      </header>
      {status ? <div className="bg-green-50 px-4 py-2 text-green-700">{status}</div> : null}
      {warning ? <div className="bg-amber-50 px-4 py-2 text-amber-800">{warning}</div> : null}
      <div className="grid flex-1 grid-cols-2 divide-x divide-slate-200">
        <div ref={editorHostRef} className="h-full overflow-auto" data-testid="md-editor" />
        <div className="preview-pane h-full overflow-auto bg-white p-4" data-testid="preview-pane">
          <style>{THEME_FIGURE_CSS}</style>
          <div ref={previewRef} dangerouslySetInnerHTML={{ __html: previewHtml }} />
        </div>
      </div>
    </div>
  );
}
