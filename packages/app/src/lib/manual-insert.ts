import type { EditorView } from "@codemirror/view";

export const TOC_MARKER = "<!-- toc -->";

export interface AnnotatedImageFenceOptions {
  width?: number;
  border?: boolean;
  alt?: string;
}

export function formatAnnotatedImageFence(
  src: string,
  options: AnnotatedImageFenceOptions = {},
): string {
  const width = options.width ?? 1000;
  const border = options.border ?? true;
  const lines = [
    "```annotated-image",
    `src: ${src}`,
    `width: ${width}`,
    `border: ${border}`,
  ];
  if (options.alt) {
    lines.push(`alt: ${options.alt}`);
  }
  lines.push("```");
  return `\n${lines.join("\n")}\n`;
}

export function formatTocMarker(): string {
  return `\n${TOC_MARKER}\n`;
}

/** カーソル位置(選択範囲があれば置換)へテキストを挿入する */
export function insertEditorText(view: EditorView, text: string): void {
  const { from, to } = view.state.selection.main;
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length },
  });
  view.focus();
}
