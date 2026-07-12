import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import {
  DEFAULT_ANNOTATION_COLOR,
  DEFAULT_ANNOTATION_FONT_SIZE,
  THEME_FIGURE_CSS,
} from "@mahomanual/core/theme";
import { fetchProjectTheme, saveProjectTheme } from "../lib/api.js";
import { Button, Card, ColorInput, TextInput } from "./ui.js";

// 未設定(=組み込み既定値)は null で表現する
interface ThemeDraft {
  color: string | null;
  fontSize: number | null;
}

function draftKey(draft: ThemeDraft): string {
  return `${draft.color ?? ""}|${draft.fontSize ?? ""}`;
}

// 注釈の既定スタイル(プロジェクト単位のテーマ)を編集するカード。
// project.yaml の annotation セクションに保存され、個別指定のない
// バッジ・テキスト・枠・線の色とフォントサイズへ適用される
export function ThemeSettings({ project }: { project: string }) {
  const [draft, setDraft] = useState<ThemeDraft>({ color: null, fontSize: null });
  const [savedKey, setSavedKey] = useState(draftKey({ color: null, fontSize: null }));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchProjectTheme(project)
      .then(({ theme }) => {
        if (cancelled) {
          return;
        }
        const next: ThemeDraft = {
          color: theme.color ?? null,
          fontSize: theme.fontSize ?? null,
        };
        setDraft(next);
        setSavedKey(draftKey(next));
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "テーマの取得に失敗しました");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [project]);

  const dirty = draftKey(draft) !== savedKey;
  const isDefault = draft.color === null && draft.fontSize === null;

  const updateDraft = (patch: Partial<ThemeDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setJustSaved(false);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const { theme } = await saveProjectTheme(project, {
        color: draft.color ?? undefined,
        fontSize: draft.fontSize ?? undefined,
      });
      const next: ThemeDraft = {
        color: theme.color ?? null,
        fontSize: theme.fontSize ?? null,
      };
      setDraft(next);
      setSavedKey(draftKey(next));
      setJustSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "テーマの保存に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  // 実際の納品 HTML / エディタと同じ CSS(THEME_FIGURE_CSS)でプレビューする。
  // 編集中の値は CSS 変数のインライン指定で上書きする(レンダラーと同じ勝ち方)
  const previewVars = {
    ...(draft.color ? { "--mm-color": draft.color } : {}),
    ...(draft.fontSize ? { "--mm-font-size": `${draft.fontSize}px` } : {}),
  } as CSSProperties;

  return (
    <Card className="p-4">
      <style>{THEME_FIGURE_CSS}</style>
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-slate-700">注釈の既定スタイル</h2>
        {justSaved && !dirty ? (
          <span className="text-xs text-emerald-600" data-testid="theme-saved">
            保存しました
          </span>
        ) : null}
      </div>
      <p className="mb-3 text-xs leading-relaxed text-slate-500">
        個別に指定していない注釈(丸数字・テキスト・枠・線)の色とフォントサイズです。
      </p>
      {loading ? (
        <div className="h-24 animate-pulse rounded-md bg-slate-100" aria-hidden="true" />
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <label className="block w-36">
            <span className="mb-1 block text-xs font-medium text-slate-600">カラー</span>
            <ColorInput
              data-testid="theme-color"
              value={draft.color ?? DEFAULT_ANNOTATION_COLOR}
              onChange={(event) => updateDraft({ color: event.target.value })}
            />
          </label>
          <label className="block w-36">
            <span className="mb-1 block text-xs font-medium text-slate-600">フォントサイズ (px)</span>
            <TextInput
              data-testid="theme-font-size"
              type="number"
              min={6}
              step={1}
              className="w-full"
              value={draft.fontSize ?? DEFAULT_ANNOTATION_FONT_SIZE}
              onChange={(event) => {
                const value = Number.parseInt(event.target.value, 10);
                if (Number.isNaN(value)) {
                  updateDraft({ fontSize: null });
                  return;
                }
                updateDraft({ fontSize: Math.max(6, value) });
              }}
            />
          </label>
          <div className="ml-auto flex gap-2">
            <Button
              data-testid="theme-reset"
              disabled={busy || isDefault}
              onClick={() => updateDraft({ color: null, fontSize: null })}
            >
              既定値に戻す
            </Button>
            <Button
              variant="primary"
              data-testid="theme-save"
              disabled={busy || !dirty}
              onClick={() => void save()}
            >
              {busy ? "保存中…" : "保存"}
            </Button>
          </div>
        </div>
      )}
      {error ? (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      <div
        className="mt-3 overflow-hidden rounded-md border border-slate-200 bg-slate-50"
        data-testid="theme-preview"
      >
        <div className="mm" style={{ height: 88, ...previewVars }}>
          <span className="mm-obj mm-badge" style={{ left: "12%", top: "50%" }}>
            1
          </span>
          <div
            className="mm-obj mm-frame"
            style={{ left: "24%", top: "24%", width: "26%", height: "52%" }}
          />
          <div className="mm-obj mm-text" style={{ left: "60%", top: "30%", width: "32%", height: "40%" }}>
            テキスト注釈
          </div>
        </div>
      </div>
    </Card>
  );
}
