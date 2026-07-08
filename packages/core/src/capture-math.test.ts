import { describe, expect, it } from "vitest";
import {
  badgePointFromBox,
  frameRectFromBox,
  type BoundingBox,
  type Region,
} from "./capture-math.js";

describe("capture-math", () => {
  const box: BoundingBox = { x: 100, y: 200, w: 50, h: 30 };
  const region: Region = { x: 0, y: 0, w: 1280, h: 960 };

  it("converts badge anchor (left center - 16px) to percent", () => {
    const expectedX = ((100 - 16) / 1280) * 100;
    const expectedY = ((200 + 30 / 2) / 960) * 100;
    const point = badgePointFromBox(box, region);
    expect(point.x).toBeCloseTo(expectedX, 4);
    expect(point.y).toBeCloseTo(expectedY, 4);
    expect(point.x).toBeCloseTo(6.5625, 4);
    expect(point.y).toBeCloseTo(22.3958333333, 4);
  });

  it("converts frame with padding to percent rect", () => {
    const padding = 4;
    const expected = {
      x: ((100 - padding) / 1280) * 100,
      y: ((200 - padding) / 960) * 100,
      w: ((50 + padding * 2) / 1280) * 100,
      h: ((30 + padding * 2) / 960) * 100,
    };
    const rect = frameRectFromBox(box, region, padding);
    expect(rect.x).toBeCloseTo(expected.x, 4);
    expect(rect.y).toBeCloseTo(expected.y, 4);
    expect(rect.w).toBeCloseTo(expected.w, 4);
    expect(rect.h).toBeCloseTo(expected.h, 4);
    expect(rect.x).toBeCloseTo(7.5, 4);
    expect(rect.y).toBeCloseTo(20.4166666667, 4);
    expect(rect.w).toBeCloseTo(4.53125, 4);
    expect(rect.h).toBeCloseTo(3.9583333333, 4);
  });
});
