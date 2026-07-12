import { describe, expect, it } from "vitest";
import { classifyEditorKeydown, type EditorKeyboardContext } from "../src/lib/editor-keyboard.js";

const base: EditorKeyboardContext = {
  isTextInput: false,
  cropEditActive: false,
  lineToolActive: false,
  hasSelection: true,
  hasCopiedIds: false,
  hasCopiedStyle: false,
  hasSelectedId: true,
};

describe("classifyEditorKeydown", () => {
  it("classifies save / zoom / undo before selection-gated commands", () => {
    expect(classifyEditorKeydown({ key: "s", code: "KeyS", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false }, base))
      .toEqual({ kind: "save" });
    expect(classifyEditorKeydown({ key: "0", code: "Digit0", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false }, base))
      .toEqual({ kind: "fit" });
    expect(classifyEditorKeydown({ key: "z", code: "KeyZ", metaKey: true, ctrlKey: false, altKey: false, shiftKey: true }, base))
      .toEqual({ kind: "redo" });
  });

  it("handles crop and line draft modes before generic input ignore", () => {
    expect(classifyEditorKeydown(
      { key: "Escape", code: "Escape", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false },
      { ...base, cropEditActive: true },
    )).toEqual({ kind: "crop-cancel" });
    expect(classifyEditorKeydown(
      { key: "Enter", code: "Enter", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false },
      { ...base, lineToolActive: true },
    )).toEqual({ kind: "finish-line" });
  });

  it("ignores editing shortcuts while typing in text fields", () => {
    expect(classifyEditorKeydown(
      { key: "d", code: "KeyD", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false },
      { ...base, isTextInput: true },
    )).toEqual({ kind: "none" });
  });

  it("maps nudge arrows with shift amount", () => {
    expect(classifyEditorKeydown(
      { key: "ArrowRight", code: "ArrowRight", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false },
      base,
    )).toEqual({ kind: "nudge", dx: 0.1, dy: 0 });
    expect(classifyEditorKeydown(
      { key: "ArrowUp", code: "ArrowUp", metaKey: false, ctrlKey: false, altKey: false, shiftKey: true },
      base,
    )).toEqual({ kind: "nudge", dx: 0, dy: -1 });
  });

  it("returns none when there is no selection for selection-gated commands", () => {
    expect(classifyEditorKeydown(
      { key: "Delete", code: "Delete", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false },
      { ...base, hasSelection: false },
    )).toEqual({ kind: "none" });
  });
});
