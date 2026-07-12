import { describe, expect, it } from "vitest";
import { clampCrop, fullImageCrop, resizeCrop, validateCrop } from "./crop-math.js";

describe("clampCrop", () => {
  it("cropを画像の実ピクセル範囲内かつ1px以上に制約する", () => {
    expect(clampCrop({ x: -10, y: 90, w: 200, h: 0 }, { w: 100, h: 100 })).toEqual({
      x: 0,
      y: 90,
      w: 100,
      h: 1,
    });
  });
});

describe("fullImageCrop", () => {
  it("returns the full natural image bounds", () => {
    expect(fullImageCrop({ w: 2560, h: 2160 })).toEqual({ x: 0, y: 0, w: 2560, h: 2160 });
  });
});

describe("validateCrop", () => {
  it("throws when crop exceeds natural bounds", () => {
    expect(() => validateCrop({ x: 0, y: 0, w: 101, h: 50 }, { w: 100, h: 100 }, "a.png")).toThrow(
      "crop is outside the source image: a.png",
    );
  });

  it("rounds and returns valid crop", () => {
    expect(validateCrop({ x: 1.2, y: 2.8, w: 10.1, h: 20.9 }, { w: 100, h: 100 })).toEqual({
      x: 1,
      y: 3,
      w: 10,
      h: 21,
    });
  });
});

describe("resizeCrop", () => {
  it("expands crop with se handle without changing image rect semantics", () => {
    const natural = { w: 2560, h: 2160 };
    const crop = { x: 0, y: 120, w: 1280, h: 960 };
    expect(resizeCrop(crop, "se", { dx: 40, dy: 20 }, natural)).toEqual({
      x: 0,
      y: 120,
      w: 1320,
      h: 980,
    });
  });

  it("moves origin with nw handle", () => {
    const natural = { w: 1280, h: 1080 };
    const crop = { x: 0, y: 120, w: 1280, h: 960 };
    expect(resizeCrop(crop, "nw", { dx: 10, dy: 20 }, natural)).toEqual({
      x: 10,
      y: 140,
      w: 1270,
      h: 940,
    });
  });
});
