import { describe, expect, it } from "vitest";
import { parseAnnotation } from "./schema.js";
import { mergeAnnotationEdits, resolveConflicts } from "./merge-annotation-edits.js";

function file(objects: unknown[], canvas = { width: 1280, height: 960 }) {
  return parseAnnotation({ version: 1, canvas, objects });
}

describe("mergeAnnotationEdits", () => {
  it("auto-merges one-sided object changes", () => {
    const base = file([
      { id: "b1", type: "badge", source: "manual", n: 1, at: { x: 10, y: 10 } },
      { id: "b2", type: "badge", source: "manual", n: 2, at: { x: 20, y: 20 } },
    ]);
    const local = file([
      { id: "b1", type: "badge", source: "manual", n: 1, at: { x: 12, y: 10 } },
      { id: "b2", type: "badge", source: "manual", n: 2, at: { x: 20, y: 20 } },
    ]);
    const remote = file([
      { id: "b1", type: "badge", source: "manual", n: 1, at: { x: 10, y: 10 } },
      { id: "b2", type: "badge", source: "manual", n: 2, at: { x: 20, y: 22 } },
    ]);
    const result = mergeAnnotationEdits(base, local, remote);
    expect(result.autoMerged).toBe(true);
    expect(result.merged.objects[0]).toMatchObject({ at: { x: 12, y: 10 } });
    expect(result.merged.objects[1]).toMatchObject({ at: { x: 20, y: 22 } });
  });

  it("reports conflicts when the same object changes on both sides", () => {
    const base = file([{ id: "b1", type: "badge", source: "manual", n: 1, at: { x: 10, y: 10 } }]);
    const local = file([{ id: "b1", type: "badge", source: "manual", n: 1, at: { x: 12, y: 10 } }]);
    const remote = file([{ id: "b1", type: "badge", source: "manual", n: 1, at: { x: 14, y: 10 } }]);
    const result = mergeAnnotationEdits(base, local, remote);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.reason).toBe("both_modified");
  });

  it("resolves conflicts with explicit choices", () => {
    const base = file([{ id: "b1", type: "badge", source: "manual", n: 1, at: { x: 10, y: 10 } }]);
    const local = file([{ id: "b1", type: "badge", source: "manual", n: 1, at: { x: 12, y: 10 } }]);
    const remote = file([{ id: "b1", type: "badge", source: "manual", n: 1, at: { x: 14, y: 10 } }]);
    const merged = mergeAnnotationEdits(base, local, remote);
    const resolved = resolveConflicts(merged.merged, { b1: "remote" }, { local, remote });
    expect(resolved.objects[0]).toMatchObject({ at: { x: 14, y: 10 } });
  });
});
