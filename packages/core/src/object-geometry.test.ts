import { describe, expect, it } from "vitest";
import type { AnnotationObject } from "./schema.js";
import {
  alignObjects,
  collectSnapGuides,
  distributeObjects,
  duplicateObjects,
  objectBounds,
  objectsInRect,
  rectAtPixelSize,
  reorderObject,
  snapPointToGuides,
  snapThresholdPct,
  translateObjects,
} from "./object-geometry.js";

const objects: AnnotationObject[] = [
  { id: "badge-1", type: "badge", source: "manual", n: 1, at: { x: 10, y: 20 } },
  { id: "badge-2", type: "badge", source: "manual", n: 2, at: { x: 30, y: 40 } },
  { id: "frame-1", type: "frame", source: "manual", rect: { x: 5, y: 10, w: 20, h: 10 } },
  {
    id: "line-1",
    type: "line",
    source: "manual",
    points: [{ x: 5, y: 6 }, { x: 15, y: 16 }],
  },
];

describe("translateObjects", () => {
  it("選択したオブジェクトを同じ量だけ移動する", () => {
    const translated = translateObjects(objects, new Set(["badge-1", "frame-1"]), 2, -3);
    expect(translated[0]).toMatchObject({ at: { x: 12, y: 17 } });
    expect(translated[2]).toMatchObject({ rect: { x: 7, y: 7, w: 20, h: 10 } });
  });

  it("ロック中のオブジェクトは移動しない", () => {
    const locked = objects.map((obj) => (obj.id === "frame-1" ? { ...obj, locked: true } : obj));
    const translated = translateObjects(locked, new Set(["badge-1", "frame-1"]), 2, -3);
    expect(translated[0]).toMatchObject({ at: { x: 12, y: 17 } });
    expect(translated[2]).toEqual(locked[2]);
  });
});

describe("duplicateObjects", () => {
  it("選択オブジェクトを前面へ複製する", () => {
    const duplicated = duplicateObjects(objects, ["badge-1"], (type) => `${type}-copy`, 1);
    expect(duplicated.objects).toHaveLength(5);
    expect(duplicated.selectedIds).toEqual(["badge-copy"]);
    expect(duplicated.objects[4]).toMatchObject({ type: "badge", at: { x: 11, y: 21 } });
  });
});

describe("reorderObject", () => {
  it("moves selected objects one step forward", () => {
    const reordered = reorderObject(objects, ["badge-1"], "forward");
    expect(reordered.map((obj) => obj.id)).toEqual(["badge-2", "badge-1", "frame-1", "line-1"]);
  });

  it("moves selected objects one step backward", () => {
    const reordered = reorderObject(objects, ["frame-1"], "backward");
    expect(reordered.map((obj) => obj.id)).toEqual(["badge-1", "frame-1", "badge-2", "line-1"]);
  });
});

describe("alignObjects", () => {
  it("aligns left edges horizontally", () => {
    const aligned = alignObjects(objects, ["badge-1", "badge-2"], "horizontal", "start");
    expect(aligned[0]).toMatchObject({ at: { x: 10, y: 20 } });
    expect(aligned[1]).toMatchObject({ at: { x: 10, y: 40 } });
  });

  it("aligns top edges vertically", () => {
    const aligned = alignObjects(objects, ["badge-1", "badge-2"], "vertical", "start");
    expect(aligned[0]).toMatchObject({ at: { x: 10, y: 20 } });
    expect(aligned[1]).toMatchObject({ at: { x: 30, y: 20 } });
  });
});

describe("distributeObjects", () => {
  it("distributes three objects horizontally with equal gaps", () => {
    const three: AnnotationObject[] = [
      { id: "b1", type: "badge", source: "manual", n: 1, at: { x: 10, y: 20 } },
      { id: "b2", type: "badge", source: "manual", n: 2, at: { x: 20, y: 20 } },
      { id: "b3", type: "badge", source: "manual", n: 3, at: { x: 40, y: 20 } },
    ];
    const distributed = distributeObjects(three, ["b1", "b2", "b3"], "horizontal");
    const xs = distributed.map((obj) => (obj.type === "badge" ? obj.at.x : 0));
    expect(xs[1]! - xs[0]!).toBeCloseTo(xs[2]! - xs[1]!, 5);
  });
});

describe("collectSnapGuides and snapPointToGuides", () => {
  it("snaps to object center and canvas center", () => {
    const guides = collectSnapGuides(objects, new Set(["badge-2"]), new Set(["badge-2"]));
    const snapped = snapPointToGuides({ x: 49.6, y: 50.2 }, guides, 0.5, false);
    expect(snapped.point.x).toBe(50);
    expect(snapped.point.y).toBe(50);
  });

  it("does not snap when disabled", () => {
    const guides = collectSnapGuides(objects, new Set(), new Set(["badge-1"]));
    const snapped = snapPointToGuides({ x: 30.2, y: 50.1 }, guides, 0.5, true);
    expect(snapped.point).toEqual({ x: 30.2, y: 50.1 });
    expect(snapped.activeGuides).toEqual([]);
  });
});

describe("snapThresholdPct", () => {
  it("converts 6 screen px to canvas percent at 200% zoom", () => {
    expect(snapThresholdPct(200, 1000, 6)).toBeCloseTo(0.3, 5);
  });
});

describe("objectsInRect", () => {
  it("selects intersecting editable objects", () => {
    expect(objectsInRect(objects, { x: 0, y: 0, w: 20, h: 30 })).toEqual(["badge-1", "frame-1", "line-1"]);
  });

  it("excludes locked objects", () => {
    const locked = objects.map((obj) => (obj.id === "frame-1" ? { ...obj, locked: true } : obj));
    expect(objectsInRect(locked, { x: 0, y: 0, w: 20, h: 30 })).toEqual(["badge-1", "line-1"]);
  });
});

describe("objectBounds", () => {
  it("returns AABB for line objects", () => {
    expect(objectBounds(objects[3]!)).toEqual({ x: 5, y: 6, w: 10, h: 10 });
  });
});

describe("rectAtPixelSize", () => {
  it("places a 1:1 pixel-sized rect centered on the current rect", () => {
    expect(rectAtPixelSize(
      { x: 20, y: 30, w: 40, h: 20 },
      { width: 1000, height: 800 },
      { w: 200, h: 100 },
    )).toEqual({ x: 30, y: 33.75, w: 20, h: 12.5 });
  });
});
