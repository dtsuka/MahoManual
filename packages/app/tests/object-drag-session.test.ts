import { describe, expect, it } from "vitest";
import type { AnnotationObject } from "@mahomanual/core/schema";
import {
  nextSelectionIds,
  prepareObjectDragSession,
} from "../src/lib/object-drag-session.js";

const badge = (id: string): AnnotationObject => ({
  id,
  type: "badge",
  source: "manual",
  n: 1,
  at: { x: 10, y: 10 },
});

const frame = (id: string): AnnotationObject => ({
  id,
  type: "frame",
  source: "manual",
  rect: { x: 0, y: 0, w: 20, h: 20 },
});

describe("nextSelectionIds", () => {
  it("replaces selection when not additive", () => {
    expect(nextSelectionIds(["a", "b"], "c", false)).toEqual(["c"]);
    expect(nextSelectionIds(["a", "b"], "a", false)).toEqual(["a", "b"]);
  });

  it("toggles membership when additive", () => {
    expect(nextSelectionIds(["a"], "b", true)).toEqual(["a", "b"]);
    expect(nextSelectionIds(["a", "b"], "a", true)).toEqual(["b"]);
  });
});

describe("prepareObjectDragSession", () => {
  const objects = [badge("b1"), badge("b2"), frame("f1")];

  it("selects a new object and drags only that id", () => {
    const session = prepareObjectDragSession({
      objects,
      selectedIds: ["b2"],
      objectId: "b1",
      additive: false,
      altKey: false,
    });
    expect(session.nextSelectedIds).toEqual(["b1"]);
    expect(session.dragIds).toEqual(["b1"]);
    expect(session.originalDragIds).toEqual(["b1"]);
    expect(session.workingObjects).toBe(objects);
  });

  it("keeps multi-selection drag ids when the target is already selected", () => {
    const session = prepareObjectDragSession({
      objects,
      selectedIds: ["b1", "b2"],
      objectId: "b1",
      additive: false,
      altKey: false,
    });
    expect(session.nextSelectedIds).toEqual(["b1", "b2"]);
    expect(session.dragIds).toEqual(["b1", "b2"]);
  });

  it("duplicates onto working objects when altKey is set", () => {
    const session = prepareObjectDragSession({
      objects,
      selectedIds: ["b1"],
      objectId: "b1",
      additive: false,
      altKey: true,
    });
    expect(session.originalDragIds).toEqual(["b1"]);
    expect(session.dragIds).toEqual(session.nextSelectedIds);
    expect(session.dragIds).toHaveLength(1);
    expect(session.dragIds[0]).not.toBe("b1");
    expect(session.workingObjects).toHaveLength(objects.length + 1);
  });
});
