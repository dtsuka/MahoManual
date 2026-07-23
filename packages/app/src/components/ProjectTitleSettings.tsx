import { useEffect, useState } from "react";
import { fetchProjectTitle, saveProjectTitle } from "../lib/api.js";
import { Button, Card, TextInput } from "./ui.js";

interface ProjectTitleSettingsProps {
  project: string;
  onChange: (title: string) => void;
}

export function ProjectTitleSettings({ project, onChange }: ProjectTitleSettingsProps) {
  const [draft, setDraft] = useState(project);
  const [saved, setSaved] = useState(project);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchProjectTitle(project)
      .then((payload) => {
        if (cancelled) return;
        setDraft(payload.title);
        setSaved(payload.title);
        onChange(payload.title);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "タイトルの取得に失敗しました");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project, onChange]);

  const dirty = draft !== saved;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await saveProjectTitle(project, draft);
      setDraft(next.title);
      setSaved(next.title);
      setJustSaved(true);
      onChange(next.title);
    } catch (err) {
      setError(err instanceof Error ? err.message : "タイトルの保存に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-slate-700">プロジェクト名</h2>
        {justSaved && !dirty ? (
          <span className="text-xs text-emerald-600" data-testid="project-title-saved">
            保存しました
          </span>
        ) : null}
      </div>
      <p className="mb-3 text-xs leading-relaxed text-slate-500">
        一覧などに表示するタイトルです。フォルダ名（ID: {project}）は変わりません。
      </p>
      {loading ? (
        <div className="h-10 animate-pulse rounded-md bg-slate-100" aria-hidden="true" />
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block min-w-0 flex-1">
            <span className="mb-1 block text-xs font-medium text-slate-600">表示タイトル</span>
            <TextInput
              data-testid="project-title-input"
              className="w-full"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setJustSaved(false);
              }}
            />
          </label>
          <Button
            variant="primary"
            data-testid="project-title-save"
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
