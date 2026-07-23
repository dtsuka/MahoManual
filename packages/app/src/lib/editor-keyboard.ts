export type EditorKeyboardCommand =
  | { kind: "none" }
  | { kind: "save" }
  | { kind: "space-down" }
  | { kind: "fit" }
  | { kind: "actual-size" }
  | { kind: "crop-cancel" }
  | { kind: "crop-commit" }
  | { kind: "select-all" }
  | { kind: "finish-line" }
  | { kind: "cancel-creation" }
  | { kind: "dismiss" }
  | { kind: "undo" }
  | { kind: "redo" }
  | { kind: "copy-style" }
  | { kind: "paste-style" }
  | { kind: "reorder"; direction: "forward" | "backward" }
  | { kind: "duplicate" }
  | { kind: "copy" }
  | { kind: "paste" }
  | { kind: "delete" }
  | { kind: "nudge"; dx: number; dy: number };

export interface EditorKeyboardContext {
  isTextInput: boolean;
  cropEditActive: boolean;
  lineToolActive: boolean;
  hasSelection: boolean;
  hasCopiedIds: boolean;
  hasCopiedStyle: boolean;
  hasSelectedId: boolean;
  /** モーダル表示時など、一時操作が無い Esc を閉じる要求として扱う */
  allowDismiss?: boolean;
}

/**
 * 注釈エディタの keydown を単一のコマンドへ分類する。
 * モード別の早期 return はここで完結させ、呼び出し側は switch のみ。
 */
export function classifyEditorKeydown(
  event: Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">,
  context: EditorKeyboardContext,
): EditorKeyboardCommand {
  const commandKey = event.metaKey || event.ctrlKey;
  const key = event.key.toLowerCase();

  if (commandKey && key === "s") {
    return { kind: "save" };
  }
  if (!context.isTextInput && event.code === "Space" && !commandKey) {
    return { kind: "space-down" };
  }
  if (!context.isTextInput && commandKey && key === "0") {
    return { kind: "fit" };
  }
  if (!context.isTextInput && commandKey && key === "1") {
    return { kind: "actual-size" };
  }
  if (context.cropEditActive) {
    if (event.key === "Escape") {
      return { kind: "crop-cancel" };
    }
    if (event.key === "Enter") {
      return { kind: "crop-commit" };
    }
  }
  if (!context.isTextInput && commandKey && key === "a") {
    return { kind: "select-all" };
  }
  if (!context.isTextInput && context.lineToolActive) {
    if (event.key === "Enter") {
      return { kind: "finish-line" };
    }
    if (event.key === "Escape") {
      return { kind: "cancel-creation" };
    }
  }
  if (context.isTextInput) {
    return { kind: "none" };
  }
  if (context.allowDismiss && event.key === "Escape") {
    return { kind: "dismiss" };
  }
  if (commandKey && key === "z") {
    return event.shiftKey ? { kind: "redo" } : { kind: "undo" };
  }
  if (event.ctrlKey && key === "y") {
    return { kind: "redo" };
  }
  if (commandKey && event.altKey && key === "c" && context.hasSelectedId) {
    return { kind: "copy-style" };
  }
  if (commandKey && event.altKey && key === "v" && context.hasCopiedStyle && context.hasSelectedId) {
    return { kind: "paste-style" };
  }
  if (!context.hasSelection) {
    return { kind: "none" };
  }
  if (event.key === "[") {
    return { kind: "reorder", direction: "backward" };
  }
  if (event.key === "]") {
    return { kind: "reorder", direction: "forward" };
  }
  if (commandKey && key === "d") {
    return { kind: "duplicate" };
  }
  if (commandKey && key === "c") {
    return { kind: "copy" };
  }
  if (commandKey && key === "v" && context.hasCopiedIds) {
    return { kind: "paste" };
  }
  if (event.key === "Delete" || event.key === "Backspace") {
    return { kind: "delete" };
  }

  const directions: Record<string, { dx: number; dy: number }> = {
    ArrowLeft: { dx: -1, dy: 0 },
    ArrowRight: { dx: 1, dy: 0 },
    ArrowUp: { dx: 0, dy: -1 },
    ArrowDown: { dx: 0, dy: 1 },
  };
  const direction = directions[event.key];
  if (direction) {
    const amount = event.shiftKey ? 1 : 0.1;
    return { kind: "nudge", dx: direction.dx * amount, dy: direction.dy * amount };
  }

  return { kind: "none" };
}
