import { useEffect, useState } from "react";
import {
  fetchProjectOutput,
  saveProjectOutput,
  type ProjectOutputFilenames,
} from "../lib/api.js";
import { Button, Card, TextInput } from "./ui.js";

interface OutputSettingsProps {
  project: string;
  onChange: (filenames: ProjectOutputFilenames) => void;
}

export function OutputSettings({ project, onChange }: OutputSettingsProps) {
  const [draft, setDraft] = useState<ProjectOutputFilenames>({
    html: `${project}.html`,
    pdf: `${project}.pdf`,
  });
  const [saved, setSaved] = useState<ProjectOutputFilenames>(draft);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchProjectOutput(project)
      .then((filenames) => {
        if (cancelled) return;
        setDraft(filenames);
        setSaved(filenames);
        onChange(filenames);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "出力設定の取得に失敗しました");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project, onChange]);

  const dirty = draft.html !== saved.html || draft.pdf !== saved.pdf;

  const update = (key: keyof ProjectOutputFilenames, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setJustSaved(false);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await saveProjectOutput(project, draft);
      setDraft(next);
      setSaved(next);
      setJustSaved(true);
      onChange(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "出力設定の保存に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-slate-700">納品ファイル名</h2>
        {justSaved && !dirty ? (
          <span className="text-xs text-emerald-600" data-testid="output-saved">
            保存しました
          </span>
        ) : null}
      </div>
      <p className="mb-3 text-xs leading-relaxed text-slate-500">
        HTML・PDFをダウンロードするときのファイル名です。拡張子も含めて入力します。
      </p>
      {loading ? (
        <div className="h-16 animate-pulse rounded-md bg-slate-100" aria-hidden="true" />
      ) : (
        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 md:grid-cols-[1fr_1fr_auto]">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">HTMLファイル名</span>
            <TextInput
              data-testid="output-html-filename"
              className="w-full"
              value={draft.html}
              onChange={(event) => update("html", event.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">PDFファイル名</span>
            <TextInput
              data-testid="output-pdf-filename"
              className="w-full"
              value={draft.pdf}
              onChange={(event) => update("pdf", event.target.value)}
            />
          </label>
          <Button
            variant="primary"
            data-testid="output-save"
            className="sm:col-span-2 sm:justify-self-end md:col-span-1"
            disabled={busy || !dirty}
            onClick={() => void save()}
          >
            {busy ? "保存中…" : "保存"}
          </Button>
        </div>
      )}
      {error ? (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
