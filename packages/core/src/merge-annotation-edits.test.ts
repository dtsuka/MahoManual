import { describe, expect, it } from "vitest";
import { parseAnnotation } from "./schema.js";
import { expandCanvas } from "./expand-canvas.js";
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

  it("uses the selected side when both sides reorder objects differently", () => {
    const objects = [
      { id: "b1", type: "badge", source: "manual", n: 1, at: { x: 10, y: 10 } },
      { id: "b2", type: "badge", source: "manual", n: 2, at: { x: 20, y: 20 } },
      { id: "b3", type: "badge", source: "manual", n: 3, at: { x: 30, y: 30 } },
    ];
    const base = file(objects);
    const local = file([objects[1], objects[0], objects[2]]);
    const remote = file([objects[0], objects[2], objects[1]]);
    const merged = mergeAnnotationEdits(base, local, remote);

    expect(merged.conflicts).toContainEqual(expect.objectContaining({ id: "(order)", reason: "order_conflict" }));
    expect(resolveConflicts(merged.merged, { "(order)": "local" }, { local, remote }).objects.map((obj) => obj.id))
      .toEqual(["b2", "b1", "b3"]);
    expect(resolveConflicts(merged.merged, { "(order)": "remote" }, { local, remote }).objects.map((obj) => obj.id))
      .toEqual(["b1", "b3", "b2"]);
  });

  it("reports modification-versus-deletion conflicts from the correct side", () => {
    const baseObject = { id: "b1", type: "badge", source: "manual", n: 1, at: { x: 10, y: 10 } };
    const modifiedObject = { ...baseObject, at: { x: 12, y: 10 } };

    const localDeleted = mergeAnnotationEdits(file([baseObject]), file([]), file([modifiedObject]));
    expect(localDeleted.conflicts[0]?.reason).toBe("local_deleted_remote_modified");

    const remoteDeleted = mergeAnnotationEdits(file([baseObject]), file([modifiedObject]), file([]));
    expect(remoteDeleted.conflicts[0]?.reason).toBe("local_modified_remote_deleted");
  });
  it("keeps an object deleted on one side when the other side left it unchanged", () => {
    const image = { id: "img", type: "image", source: "manual", src: "img/raw/a.png", rect: { x: 0, y: 0, w: 100, h: 100 } };
    const badge = { id: "b1", type: "badge", source: "manual", n: 1, at: { x: 50, y: 50 } };
    const base = file([image, badge]);
    const deleted = file([image]);

    const localDeleted = mergeAnnotationEdits(base, deleted, base);
    expect(localDeleted.autoMerged).toBe(true);
    expect(localDeleted.merged.objects.map((obj) => obj.id)).toEqual(["img"]);

    const remoteDeleted = mergeAnnotationEdits(base, base, deleted);
    expect(remoteDeleted.autoMerged).toBe(true);
    expect(remoteDeleted.merged.objects.map((obj) => obj.id)).toEqual(["img"]);
  });

  it("treats a canvas change on one side and object changes on the other as a conflict", () => {
    const image = { id: "img", type: "image", source: "manual", src: "img/raw/a.png", rect: { x: 0, y: 0, w: 100, h: 100 } };
    const badge = { id: "b1", type: "badge", source: "manual", n: 1, at: { x: 50, y: 50 } };
    const base = file([image, badge], { width: 1000, height: 500 });
    const expanded = expandCanvas(base, { left: 1000 });
    // キャンバス変更前の座標系で追加したバッジ(画像上の x=900px)
    const added = file(
      [image, badge, { id: "b2", type: "badge", source: "manual", n: 2, at: { x: 90, y: 50 } }],
      { width: 1000, height: 500 },
    );

    for (const [local, remote] of [[added, expanded], [expanded, added]] as const) {
      const result = mergeAnnotationEdits(base, local, remote);
      expect(result.autoMerged).toBe(false);
      expect(result.conflicts).toContainEqual(expect.objectContaining({ id: "(canvas)", reason: "canvas_conflict" }));
      // どちらを選んでも、その側の座標系のまま(%座標がずれた状態を作らない)
      expect(resolveConflicts(result.merged, { "(canvas)": "local" }, { local, remote })).toEqual(local);
      expect(resolveConflicts(result.merged, { "(canvas)": "remote" }, { local, remote })).toEqual(remote);
    }
  });

  it("auto-merges a one-sided canvas change when the other side has no object changes", () => {
    const badge = { id: "b1", type: "badge", source: "manual", n: 1, at: { x: 50, y: 50 } };
    const base = file([badge], { width: 1000, height: 500 });
    const expanded = expandCanvas(base, { left: 1000 });

    const result = mergeAnnotationEdits(base, base, expanded);
    expect(result.autoMerged).toBe(true);
    expect(result.merged).toEqual(expanded);
  });
});
