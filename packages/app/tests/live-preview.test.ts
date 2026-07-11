import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  findAnnotatedImageFences,
  findFenceForVerticalMove,
} from "../src/lib/live-preview.js";

function stateFor(source: string): EditorState {
  return EditorState.create({ doc: source, extensions: [markdown()] });
}

describe("findAnnotatedImageFences", () => {
  it("finds annotated-image fences and reads their src", () => {
    const source = [
      "# Manual",
      "",
      "```annotated-image",
      "src: first-image",
      "width: 1000",
      "```",
      "",
      "~~~annotated-image",
      "src: second-image",
      "~~~",
    ].join("\n");

    const fences = findAnnotatedImageFences(stateFor(source));

    expect(fences.map(({ annotationId }) => annotationId)).toEqual([
      "first-image",
      "second-image",
    ]);
    expect(source.slice(fences[0]!.from, fences[0]!.to)).toContain("width: 1000");
  });

  it("ignores examples nested inside a different fenced code block", () => {
    const source = [
      "````md",
      "```annotated-image",
      "src: example-only",
      "```",
      "````",
    ].join("\n");

    expect(findAnnotatedImageFences(stateFor(source))).toEqual([]);
  });

  it("does not create a preview for a fence without src", () => {
    const source = "```annotated-image\nwidth: 800\n```";

    expect(findAnnotatedImageFences(stateFor(source))).toEqual([]);
  });
});

describe("findFenceForVerticalMove", () => {
  const source = [
    "# Before",
    "",
    "```annotated-image",
    "src: demo",
    "```",
    "",
    "After",
  ].join("\n");

  function stateAtLine(lineNumber: number): EditorState {
    const state = stateFor(source);
    return state.update({ selection: { anchor: state.doc.line(lineNumber).from } }).state;
  }

  it("finds the image fence immediately above the cursor", () => {
    expect(findFenceForVerticalMove(stateAtLine(6), -1)?.annotationId).toBe("demo");
  });

  it("finds the image fence immediately below the cursor", () => {
    expect(findFenceForVerticalMove(stateAtLine(2), 1)?.annotationId).toBe("demo");
  });

  it("does not intercept vertical movement away from an image fence", () => {
    expect(findFenceForVerticalMove(stateAtLine(7), -1)).toBeNull();
  });
});
