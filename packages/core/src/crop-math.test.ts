import { describe, expect, it } from "vitest";
import {
  clampCrop,
  fullImageCrop,
  rectFromCropInReveal,
  resizeCrop,
  revealRectForCropEdit,
  validateCrop,
} from "./crop-math.js";

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

describe("revealRectForCropEdit", () => {
  const canvas = { width: 1280, height: 960 };
  const natural = { w: 2560, h: 1920 };

  it("現在のcrop→rectの縮尺で元画像全体のrectを復元し、crop窓が元rectに一致する", () => {
    const crop = { x: 0, y: 240, w: 2560, h: 1440 };
    // crop 2560×1440 を scale 0.5 で置くと 1280×720 → canvas% は w=100, h=75
    const rect = { x: 0, y: 12.5, w: 100, h: 75 };
    const reveal = revealRectForCropEdit(rect, crop, natural, canvas);

    // 縮尺は crop.w → rect.w から一意に決まる(2560px → 1280 canvas px → 0.5)
    expect(reveal.w).toBeCloseTo(100, 5);
    expect(reveal.h).toBeCloseTo((1920 * 0.5 / 960) * 100, 5);
    expect(reveal.x).toBeCloseTo(0, 5);
    expect(reveal.y).toBeCloseTo(12.5 - (240 * 0.5 / 960) * 100, 5);

    const cropWindow = rectFromCropInReveal(reveal, crop, natural);
    expect(cropWindow.x).toBeCloseTo(rect.x, 5);
    expect(cropWindow.y).toBeCloseTo(rect.y, 5);
    expect(cropWindow.w).toBeCloseTo(rect.w, 5);
    expect(cropWindow.h).toBeCloseTo(rect.h, 5);
  });

  it("フルcropならreveal rectは元rectと同じアスペクトを保つ", () => {
    const crop = fullImageCrop(natural);
    const rect = { x: 10, y: 10, w: 80, h: 80 };
    const reveal = revealRectForCropEdit(rect, crop, natural, canvas);
    const revealAspect = (reveal.w / 100 * canvas.width) / (reveal.h / 100 * canvas.height);
    expect(revealAspect).toBeCloseTo(natural.w / natural.h, 5);
  });
});

describe("rectFromCropInReveal", () => {
  it("reveal上のcrop割合をキャンバス%rectへ写す", () => {
    const reveal = { x: 0, y: -12.5, w: 100, h: 125 };
    const natural = { w: 1000, h: 1000 };
    const crop = { x: 0, y: 100, w: 1000, h: 800 };
    expect(rectFromCropInReveal(reveal, crop, natural)).toEqual({
      x: 0,
      y: 0,
      w: 100,
      h: 100,
    });
  });
});
