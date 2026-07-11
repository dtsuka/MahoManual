import { syntaxTree } from "@codemirror/language";
import { StateField, type EditorState, type Extension, type Range } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
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

    container.append(toolbar, body);
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
  return field;
}
