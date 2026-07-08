import { describe, expect, it } from "vitest";
import { resizeRect } from "../src/lib/geometry.js";

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
