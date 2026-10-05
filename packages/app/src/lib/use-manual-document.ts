import { useCallback, useEffect, useRef, useState } from "react";
import { saveManual } from "./api.js";

export type ExternalManualChange = "ignore" | "conflict" | "apply";

/**
 * manual.md の本文・保存済み本文・未保存状態・保存処理を閉じる。
 * CodeMirror への反映は呼び出し側が行い、ここでは判定と保存だけを担う。
 */
export function useManualDocument(project: string) {
  const markdownRef = useRef<string | null>(null);
  /** 最後にサーバーへ保存した(または読み込んだ)本文。保存エコーの判定に使う */
  const savedBodyRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const syncDirty = useCallback(() => {
    const next = markdownRef.current !== savedBodyRef.current;
    dirtyRef.current = next;
    setDirty(next);
  }, []);

  /** 読み込み・外部変更の取り込みで本文全体を置き換えた */
  const resetTo = useCallback((body: string) => {
    markdownRef.current = body;
    savedBodyRef.current = body;
    syncDirty();
  }, [syncDirty]);

  /** エディタでの入力 */
  const updateText = useCallback((value: string) => {
    markdownRef.current = value;
    syncDirty();
  }, [syncDirty]);

  const save = useCallback(async (): Promise<boolean> => {
    const value = markdownRef.current;
    if (value === null) {
      return false;
    }
    try {
      await saveManual(project, value);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "manual.md の保存に失敗しました");
      return false;
    }
    savedBodyRef.current = value;
    setSaveError(null);
    // 保存中に入力が続いていれば未保存のまま残す
    syncDirty();
    return true;
  }, [project, syncDirty]);

  /** 監視で読み直した本文をどう扱うか */
  const classifyExternal = useCallback((body: string): ExternalManualChange => {
    // 自分の保存によるエコー、または手元と同じ内容
    if (body === savedBodyRef.current || body === markdownRef.current) {
      return "ignore";
    }
    return dirtyRef.current ? "conflict" : "apply";
  }, []);

  const clearSaveError = useCallback(() => setSaveError(null), []);

  /** 画面内の「戻る」などで離れる前の確認。離れてよければ true */
  const confirmLeave = useCallback((): boolean => {
    if (!dirtyRef.current) {
      return true;
    }
    return window.confirm("manual.md に未保存の変更があります。破棄して移動しますか?");
  }, []);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  return {
    markdownRef,
    dirtyRef,
    dirty,
    saveError,
    clearSaveError,
    resetTo,
    updateText,
    save,
    classifyExternal,
    confirmLeave,
  };
}
