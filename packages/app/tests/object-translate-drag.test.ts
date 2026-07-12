import { describe, expect, it } from "vitest";
import type { AnnotationObject } from "@mahomanual/core/schema";
import {
  commitTranslateDrag,
  previewTranslateDrag,
  resolveTranslateDragDelta,
} from "../src/lib/object-translate-drag.js";
import type { PreparedObjectDragSession } from "../src/lib/object-drag-session.js";

const badge = (id: string, x: number, y: number): AnnotationObject => ({
  id,
  type: "badge",
  source: "manual",
  n: 1,
  at: { x, y },
});

const session = (objects: AnnotationObject[], dragIds: string[]): PreparedObjectDragSession => ({
  originalDragIds: dragIds,
  nextSelectedIds: dragIds,
  workingObjects: objects,
  dragIds,
});

describe("resolveTranslateDragDelta", () => {
  it("returns snapped delta and drag id set", () => {
    const objects = [badge("b1", 10, 20)];
    const result = resolveTranslateDragDelta({
      session: session(objects, ["b1"]),
      startPct: { x: 10, y: 20 },
      currentPct: { x: 12, y: 18 },
      thresholdPct: 1,
      altKey: true,
    });
    expect(result.dx).toBe(2);
    expect(result.dy).toBe(-2);
    expect([...result.dragIdSet]).toEqual(["b1"]);
    expect(result.activeGuides).toEqual([]);
  });
});

describe("previewTranslateDrag", () => {
  it("returns translated preview objects", () => {
    const objects = [badge("b1", 10, 20)];
    const preview = previewTranslateDrag({
      session: session(objects, ["b1"]),
      startPct: { x: 0, y: 0 },
      currentPct: { x: 5, y: 7 },
      thresholdPct: 1,
      altKey: false,
    });
    expect(preview.objects[0]).toMatchObject({ at: { x: 15, y: 27 } });
  });
});

describe("commitTranslateDrag", () => {
  it("translates latest objects when alt is not held at down", () => {
    const latest = [badge("b1", 10, 20)];
    const result = commitTranslateDrag({
      session: session(latest, ["b1"]),
      startPct: { x: 0, y: 0 },
      currentPct: { x: 4, y: 6 },
      thresholdPct: 1,
      altKeyAtDown: false,
      altKeyAtEnd: false,
      latestObjects: latest,
    });
    expect(result.selectedIds).toBeUndefined();
    expect(result.objects[0]).toMatchObject({ at: { x: 14, y: 26 } });
  });

  it("duplicates and translates when alt was held at down", () => {
    const latest = [badge("b1", 10, 20)];
    const result = commitTranslateDrag({
      session: session(latest, ["b1"]),
      startPct: { x: 0, y: 0 },
      currentPct: { x: 2, y: 3 },
      thresholdPct: 1,
      altKeyAtDown: true,
      altKeyAtEnd: true,
      latestObjects: latest,
    });
    expect(result.selectedIds).toHaveLength(1);
    expect(result.selectedIds?.[0]).not.toBe("b1");
    expect(result.objects).toHaveLength(2);
    expect(result.objects[1]).toMatchObject({ at: { x: 12, y: 23 } });
  });
});
