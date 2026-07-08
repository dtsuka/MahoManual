import { describe, expect, it } from "vitest";
import {
  nearestSegmentIndex,
  resizeRect,
  snapAngle,
  snapToGuides,
  stickySnap,
} from "../src/lib/geometry.js";

describe("resizeRect", () => {
  it("expands right/bottom edges with se handle", () => {
    expect(resizeRect({ x: 10, y: 10, w: 20, h: 10 }, "se", 5, 3)).toEqual({ x: 10, y: 10, w: 25, h: 13 });
  });

  it("moves origin and shrinks with nw handle", () => {
    expect(resizeRect({ x: 10, y: 10, w: 20, h: 10 }, "nw", 4, 2)).toEqual({ x: 14, y: 12, w: 16, h: 8 });
  });

  it("resizes only horizontally with e handle", () => {
    expect(resizeRect({ x: 10, y: 10, w: 20, h: 10 }, "e", -5, 99)).toEqual({ x: 10, y: 10, w: 15, h: 10 });
  });

  it("clamps width/height to a positive minimum", () => {
    const rect = resizeRect({ x: 10, y: 10, w: 5, h: 5 }, "se", -10, -10);
    expect(rect.w).toBeGreaterThan(0);
    expect(rect.h).toBeGreaterThan(0);
  });

  it("keeps the east edge fixed when dragging w handle past it", () => {
    const rect = resizeRect({ x: 10, y: 10, w: 5, h: 5 }, "w", 10, 0);
    expect(rect.w).toBeGreaterThan(0);
    expect(rect.x + rect.w).toBeCloseTo(15, 5);
  });
});

describe("snapAngle", () => {
  it("snaps a nearly horizontal drag to exactly horizontal", () => {
    const snapped = snapAngle({ x: 30, y: 21 }, { x: 20, y: 20 });
    expect(snapped.y).toBeCloseTo(20, 5);
    expect(snapped.x).toBeGreaterThan(20);
  });

  it("snaps to the 45deg diagonal", () => {
    const snapped = snapAngle({ x: 30, y: 29 }, { x: 20, y: 20 });
    expect(snapped.x - 20).toBeCloseTo(snapped.y - 20, 5);
  });

  it("keeps the distance from the anchor", () => {
    const anchor = { x: 10, y: 10 };
    const snapped = snapAngle({ x: 22, y: 13 }, anchor);
    expect(Math.hypot(snapped.x - anchor.x, snapped.y - anchor.y)).toBeCloseTo(Math.hypot(12, 3), 5);
  });
});

describe("snapToGuides", () => {
  it("snaps x and y independently to nearby guide coordinates", () => {
    const snapped = snapToGuides(
      { x: 50.4, y: 30.6 },
      [
        { x: 50, y: 10 },
        { x: 90, y: 31 },
      ],
      0.7,
    );
    expect(snapped).toEqual({ x: 50, y: 31 });
  });

  it("does not snap beyond the threshold", () => {
    const snapped = snapToGuides({ x: 52, y: 33 }, [{ x: 50, y: 10 }], 0.7);
    expect(snapped).toEqual({ x: 52, y: 33 });
  });

  it("prefers the nearest guide when multiple are in range", () => {
    const snapped = snapToGuides(
      { x: 50.4, y: 0 },
      [
        { x: 50, y: 0 },
        { x: 50.6, y: 0 },
      ],
      0.7,
    );
    expect(snapped.x).toBeCloseTo(50.6, 5);
  });
});

describe("stickySnap", () => {
  const guides = [{ x: 50, y: 80 }];

  it("snaps when within the snap distance", () => {
    const result = stickySnap({ x: 50.5, y: 30 }, guides, {}, 0.7, 1.5);
    expect(result.point.x).toBe(50);
    expect(result.snapped.x).toBe(50);
  });

  it("keeps the snap while within the release distance (hysteresis)", () => {
    // 吸着距離(0.7)は超えているが解除距離(1.5)以内 → 吸着を維持しフリッカーしない
    const result = stickySnap({ x: 51.2, y: 30 }, guides, { x: 50 }, 0.7, 1.5);
    expect(result.point.x).toBe(50);
    expect(result.snapped.x).toBe(50);
  });

  it("releases the snap beyond the release distance", () => {
    const result = stickySnap({ x: 52, y: 30 }, guides, { x: 50 }, 0.7, 1.5);
    expect(result.point.x).toBe(52);
    expect(result.snapped.x).toBeUndefined();
  });

  it("snaps x and y independently", () => {
    const result = stickySnap({ x: 50.5, y: 80.4 }, guides, {}, 0.7, 1.5);
    expect(result.point).toEqual({ x: 50, y: 80 });
  });
});

describe("nearestSegmentIndex", () => {
  it("returns the index of the segment closest to the point", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    expect(nearestSegmentIndex(points, { x: 5, y: 1 })).toBe(0);
    expect(nearestSegmentIndex(points, { x: 11, y: 5 })).toBe(1);
  });

  it("handles points beyond segment ends", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    expect(nearestSegmentIndex(points, { x: 20, y: 5 })).toBe(0);
  });
});
