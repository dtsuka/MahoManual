import { describe, expect, it } from "vitest";
import { snapAngle } from "./geometry.js";
import { resolveLineDraftPoint, snapThresholdForCanvas } from "./creation-geometry.js";
import { snapDraggedLinePoint } from "./line-point-selection.js";

// 横長キャンバス: x の 1% = 20px、y の 1% = 5px
const wide = { width: 2000, height: 500 };

function pxDelta(point: { x: number; y: number }, anchor: { x: number; y: number }) {
  return {
    dx: ((point.x - anchor.x) / 100) * wide.width,
    dy: ((point.y - anchor.y) / 100) * wide.height,
  };
}

describe("45°スナップは横長・縦長キャンバスでも画面上の角度で揃える", () => {
  const anchor = { x: 10, y: 10 };

  it("見た目が45°付近の点は、キャンバスpxで45°の線上へ揃う", () => {
    // px で dx=210, dy=195(見た目はほぼ45°)。%空間では約76°に見える
    const snapped = snapAngle({ x: 20.5, y: 49 }, anchor, wide);
    const { dx, dy } = pxDelta(snapped, anchor);
    expect(dx).toBeGreaterThan(0);
    expect(dx).toBeCloseTo(dy, 5);
  });

  it("見た目がほぼ水平の点は水平に揃い、px距離を保つ", () => {
    const pointer = { x: 30, y: 12 };
    const snapped = snapAngle(pointer, anchor, wide);
    expect(snapped.y).toBeCloseTo(10, 5);
    const before = pxDelta(pointer, anchor);
    const after = pxDelta(snapped, anchor);
    expect(Math.hypot(after.dx, after.dy)).toBeCloseTo(Math.hypot(before.dx, before.dy), 5);
  });

  it("線の作成でもキャンバスの縦横比を使う", () => {
    const snapped = resolveLineDraftPoint({ x: 20.5, y: 49 }, anchor, {
      shiftKey: true,
      round: false,
      canvas: wide,
    });
    const { dx, dy } = pxDelta(snapped, anchor);
    expect(dx).toBeCloseTo(dy, 5);
  });

  it("点のドラッグでもキャンバスの縦横比を使う", () => {
    const snapped = snapDraggedLinePoint({ x: 20.5, y: 49 }, {
      shiftKey: true,
      primaryIndex: 1,
      primaryStart: { x: 50, y: 50 },
      points: [anchor, { x: 50, y: 50 }],
      dragIndices: [1],
      canvas: wide,
    });
    const { dx, dy } = pxDelta(snapped, anchor);
    expect(dx).toBeCloseTo(dy, 5);
  });
});

describe("snapThresholdForCanvas", () => {
  it("画面上の6pxを、表示倍率とキャンバスの設計幅から%に換算する", () => {
    // 50%表示の1000px幅キャンバス: 6画面px = 12キャンバスpx = 1.2%
    expect(snapThresholdForCanvas(50, { width: 1000, height: 500 })).toBeCloseTo(1.2, 5);
    expect(snapThresholdForCanvas(100, { width: 2000, height: 500 })).toBeCloseTo(0.3, 5);
  });
});
