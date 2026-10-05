// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnnotationFile } from "@mahomanual/core/schema";
import { renderHook } from "../test-utils/render-hook.js";
import { useAnnotationDocument } from "./use-annotation-document.js";

function sample(): AnnotationFile {
  return {
    version: 1,
    canvas: { width: 1000, height: 500 },
    objects: [
      { id: "b1", type: "badge", source: "manual", n: 1, at: { x: 10, y: 10 } },
    ],
  };
}

function badgeX(annotation: AnnotationFile | null): number | undefined {
  const badge = annotation?.objects.find((obj) => obj.id === "b1");
  return badge?.type === "badge" ? badge.at.x : undefined;
}

function setup() {
  const hook = renderHook(() => useAnnotationDocument());
  act(() => {
    hook.result.current.replaceDocument(sample(), {
      savedSnapshot: sample(),
      dirty: false,
      clearHistory: true,
    });
  });
  return hook;
}

describe("useAnnotationDocument: 矢印キー移動の履歴統合", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("統合待ちの移動を元に戻すと移動前に戻り、遅れて履歴が積まれない", () => {
    const { result } = setup();
    act(() => {
      result.current.nudgeSelection(["b1"], 1, 0);
      result.current.nudgeSelection(["b1"], 1, 0);
    });
    expect(badgeX(result.current.annotation)).toBe(12);

    act(() => {
      result.current.undo();
    });
    expect(badgeX(result.current.annotation)).toBe(10);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(badgeX(result.current.annotation)).toBe(10);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);

    act(() => {
      result.current.redo();
    });
    expect(badgeX(result.current.annotation)).toBe(12);
  });

  it("統合待ちの移動の直後の編集は別の履歴になり、順に戻せる", () => {
    const { result } = setup();
    act(() => {
      result.current.nudgeSelection(["b1"], 1, 0);
    });
    act(() => {
      result.current.applyLocalChange((current) => ({
        ...current,
        canvas: { width: 1200, height: 500 },
      }));
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    act(() => {
      result.current.undo();
    });
    expect(result.current.annotation?.canvas.width).toBe(1000);
    expect(badgeX(result.current.annotation)).toBe(11);

    act(() => {
      result.current.undo();
    });
    expect(badgeX(result.current.annotation)).toBe(10);
    expect(result.current.canUndo).toBe(false);
  });

  it("統合待ちのままドキュメントを置き換えると、古い移動が履歴に残らない", () => {
    const { result } = setup();
    act(() => {
      result.current.nudgeSelection(["b1"], 1, 0);
    });
    const external: AnnotationFile = { ...sample(), canvas: { width: 3000, height: 500 } };
    act(() => {
      result.current.replaceDocument(external, {
        savedSnapshot: external,
        dirty: false,
        clearHistory: true,
      });
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.canUndo).toBe(false);
    expect(result.current.annotation?.canvas.width).toBe(3000);
  });
});

describe("useAnnotationDocument: 保存完了の反映", () => {
  it("保存中に続けた編集は保存完了後も残り、未保存のまま", () => {
    const { result } = setup();
    act(() => {
      result.current.nudgeSelection(["b1"], 5, 0);
      result.current.commitArrowCoalesce();
    });
    const sent = result.current.annotationRef.current!;
    act(() => {
      result.current.applyLocalChange((current) => ({
        ...current,
        canvas: { width: 1200, height: 500 },
      }));
    });

    act(() => {
      result.current.markSaved(structuredClone(sent), sent);
    });

    expect(result.current.annotation?.canvas.width).toBe(1200);
    expect(badgeX(result.current.annotation)).toBe(15);
    expect(result.current.dirty).toBe(true);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.getSavedBase().canvas.width).toBe(1000);
    expect(badgeX(result.current.getSavedBase())).toBe(15);
  });

  it("送信した内容のままなら保存結果へ置き換えて未保存を解除する", () => {
    const { result } = setup();
    act(() => {
      result.current.applyLocalChange((current) => ({
        ...current,
        canvas: { width: 1200, height: 500 },
      }));
    });
    const sent = result.current.annotationRef.current!;
    const normalized: AnnotationFile = { ...structuredClone(sent), caption: undefined } as AnnotationFile;

    act(() => {
      result.current.markSaved(normalized, sent);
    });

    expect(result.current.annotation).toEqual(normalized);
    expect(result.current.dirty).toBe(false);
    // 保存で履歴は消えない
    expect(result.current.canUndo).toBe(true);
  });
});

describe("useAnnotationDocument: サーバー側で保存された変更の取り込み", () => {
  it("rebaseSaved は保存スナップショットだけを更新し、未保存判定をやり直す", () => {
    const { result } = setup();
    const remote: AnnotationFile = {
      ...sample(),
      objects: [
        ...sample().objects,
        {
          id: "image-2",
          type: "image",
          source: "manual",
          src: "img/raw/x.png",
          rect: { x: 0, y: 0, w: 50, h: 50 },
        },
      ],
    };
    act(() => {
      result.current.applyLocalChange(() => remote);
      result.current.rebaseSaved(remote);
    });
    expect(result.current.dirty).toBe(false);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.isSavedBase(remote)).toBe(true);
    expect(result.current.isSavedBase(sample())).toBe(false);
  });
});
