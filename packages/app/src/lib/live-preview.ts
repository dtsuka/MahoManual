import { syntaxTree } from "@codemirror/language";
import {
  Prec,
  StateField,
  type EditorState,
  type Extension,
  type Range,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  type Command,
  WidgetType,
} from "@codemirror/view";

export interface AnnotatedImageFence {
  from: number;
  to: number;
  contentFrom: number;
  annotationId: string;
}

export interface LivePreviewOptions {
  figures: ReadonlyMap<string, string>;
  onOpenAnnotation: (annotationId: string) => void;
}

const SRC_LINE = /^\s*src\s*:\s*["']?([^\s#"']+)["']?(?:\s+#.*)?$/m;

export function findAnnotatedImageFences(state: EditorState): AnnotatedImageFence[] {
  const fences: AnnotatedImageFence[] = [];

  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== "FencedCode") {
        return;
      }
      const info = node.node.getChild("CodeInfo");
      const content = node.node.getChild("CodeText");
      if (!info || !content || state.doc.sliceString(info.from, info.to).trim() !== "annotated-image") {
        return;
      }
      const match = state.doc.sliceString(content.from, content.to).match(SRC_LINE);
      const annotationId = match?.[1];
      if (!annotationId) {
        return;
      }
      fences.push({
        from: state.doc.lineAt(node.from).from,
        to: state.doc.lineAt(node.to).to,
        contentFrom: content.from,
        annotationId,
      });
    },
  });

  return fences;
}

export function findFenceForVerticalMove(
  state: EditorState,
  direction: -1 | 1,
): AnnotatedImageFence | null {
  const selection = state.selection.main;
  if (!selection.empty) {
    return null;
  }
  const cursorLine = state.doc.lineAt(selection.head);
  for (const fence of findAnnotatedImageFences(state)) {
    if (direction < 0) {
      const closingLine = state.doc.lineAt(fence.to);
      if (cursorLine.number === closingLine.number + 1) {
        return fence;
      }
    } else {
      const openingLine = state.doc.lineAt(fence.from);
      if (cursorLine.number === openingLine.number - 1) {
        return fence;
      }
    }
  }
  return null;
}

export function extractAnnotatedFigures(html: string): Map<string, string> {
  const figures = new Map<string, string>();
  if (!html || typeof document === "undefined") {
    return figures;
  }
  const template = document.createElement("template");
  template.innerHTML = html;
  for (const figure of template.content.querySelectorAll<HTMLElement>("figure[data-mm-annotation]")) {
    const annotationId = figure.dataset.mmAnnotation;
    if (annotationId && !figures.has(annotationId)) {
      figures.set(annotationId, figure.outerHTML);
    }
  }
  return figures;
}

function selectionTouches(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((range) => range.from <= to && range.to >= from);
}

interface SyntaxChild {
  name: string;
  from: number;
  to: number;
  nextSibling: SyntaxChild | null;
}

interface SyntaxNodeLike {
  from: number;
  to: number;
  node: { firstChild: SyntaxChild | null };
}

class AnnotatedImageWidget extends WidgetType {
  constructor(
    readonly fence: AnnotatedImageFence,
    readonly html: string,
    readonly onOpenAnnotation: (annotationId: string) => void,
  ) {
    super();
  }

  eq(other: AnnotatedImageWidget): boolean {
    return this.fence.annotationId === other.fence.annotationId && this.html === other.html;
  }

  toDOM(view: EditorView): HTMLElement {
    const container = document.createElement("div");
    container.className = "cm-live-figure";
    container.dataset.mmAnnotation = this.fence.annotationId;

    const toolbar = document.createElement("div");
    toolbar.className = "cm-live-figure-toolbar";
    const label = document.createElement("span");
    label.textContent = this.fence.annotationId;
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "Markdownを編集";
    editButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      view.dispatch({
        selection: { anchor: this.fence.contentFrom },
        scrollIntoView: true,
      });
      view.focus();
    });
    toolbar.append(label, editButton);

    const body = document.createElement("div");
    body.className = "cm-live-figure-body";
    body.innerHTML = this.html;
    body.querySelector("figure")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.onOpenAnnotation(this.fence.annotationId);
    });

    const card = document.createElement("div");
    card.className = "cm-live-figure-card";
    card.append(toolbar, body);
    container.append(card);
    return container;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function addHiddenMarks(
  state: EditorState,
  node: SyntaxNodeLike,
  markName: string,
  ranges: Range<Decoration>[],
): void {
  if (selectionTouches(state, node.from, node.to)) {
    return;
  }
  for (let child = node.node.firstChild; child; child = child.nextSibling) {
    if (child.name === markName) {
      ranges.push(Decoration.replace({}).range(child.from, child.to));
    }
  }
}

function buildDecorations(state: EditorState, options: LivePreviewOptions): DecorationSet {
  const ranges: Range<Decoration>[] = [];

  for (const fence of findAnnotatedImageFences(state)) {
    if (selectionTouches(state, fence.from, fence.to)) {
      continue;
    }
    const html = options.figures.get(fence.annotationId);
    if (html) {
      ranges.push(
        Decoration.replace({
          block: true,
          widget: new AnnotatedImageWidget(fence, html, options.onOpenAnnotation),
        }).range(fence.from, fence.to),
      );
    }
  }

  syntaxTree(state).iterate({
    enter(node) {
      const heading = /^ATXHeading([1-6])$/.exec(node.name);
      if (heading) {
        ranges.push(
          Decoration.line({ class: `cm-live-heading cm-live-heading-${heading[1]}` }).range(
            state.doc.lineAt(node.from).from,
          ),
        );
        addHiddenMarks(state, node, "HeaderMark", ranges);
        return;
      }
      if (node.name === "StrongEmphasis") {
        ranges.push(Decoration.mark({ class: "cm-live-strong" }).range(node.from, node.to));
        addHiddenMarks(state, node, "EmphasisMark", ranges);
        return;
      }
      if (node.name === "Emphasis") {
        ranges.push(Decoration.mark({ class: "cm-live-emphasis" }).range(node.from, node.to));
        addHiddenMarks(state, node, "EmphasisMark", ranges);
        return;
      }
      if (node.name === "InlineCode") {
        ranges.push(Decoration.mark({ class: "cm-live-inline-code" }).range(node.from, node.to));
        addHiddenMarks(state, node, "CodeMark", ranges);
      }
    },
  });

  return Decoration.set(ranges, true);
}

function moveIntoImageFence(direction: -1 | 1): Command {
  return (view) => {
    const selection = view.state.selection.main;
    if (!selection.empty) {
      return false;
    }
    const fences = findAnnotatedImageFences(view.state);
    const activeFence = fences.find(
      (fence) => selection.head >= fence.from && selection.head <= fence.to,
    );
    if (activeFence) {
      // Widgetからソースへ切り替えた直後はCodeMirrorの高さ計測が変わるため、
      // 標準のピクセル基準移動ではなくMarkdown上の隣接行へ移動する。
      const currentLine = view.state.doc.lineAt(selection.head);
      const targetLineNumber = currentLine.number + direction;
      if (targetLineNumber < 1 || targetLineNumber > view.state.doc.lines) {
        return false;
      }
      const targetLine = view.state.doc.line(targetLineNumber);
      const column = selection.head - currentLine.from;
      view.dispatch({
        selection: { anchor: targetLine.from + Math.min(column, targetLine.length) },
        scrollIntoView: true,
      });
      return true;
    }
    const directFence = findFenceForVerticalMove(view.state, direction);
    const defaultTarget = view.moveVertically(selection, direction > 0);
    // Block replacementを標準移動が飛び越える場合だけフェンスへ入る。
    // それ以外はfalseを返し、通常のCodeMirrorキーマップに処理を任せる。
    const crossedFences = fences.filter((fence) =>
      direction < 0
        ? selection.head > fence.to && defaultTarget.head <= fence.from
        : selection.head < fence.from && defaultTarget.head >= fence.to,
    );
    const fence =
      directFence ??
      (direction < 0
        ? crossedFences[crossedFences.length - 1]
        : crossedFences[0]);
    if (!fence) {
      return false;
    }
    const anchor = direction < 0 ? fence.to : fence.from;
    view.dispatch({
      selection: { anchor },
      scrollIntoView: true,
    });
    return true;
  };
}

export function livePreview(options: LivePreviewOptions): Extension {
  const field = StateField.define<DecorationSet>({
    create(state) {
      return buildDecorations(state, options);
    },
    update(decorations, transaction) {
      if (transaction.docChanged || transaction.selection) {
        return buildDecorations(transaction.state, options);
      }
      return decorations;
    },
    provide: (value) => EditorView.decorations.from(value),
  });
  return [
    field,
    Prec.highest(
      keymap.of([
        { key: "ArrowUp", run: moveIntoImageFence(-1) },
        { key: "ArrowDown", run: moveIntoImageFence(1) },
      ]),
    ),
  ];
}
