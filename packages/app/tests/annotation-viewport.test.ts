import { describe, expect, it } from "vitest";
import {
  clampZoom,
  fitCanvasZoom,
  stepZoom,
} from "../src/lib/annotation-viewport.js";

describe("annotation viewport zoom", () => {
  it("ズームを25〜400%へ制約し、25%刻みで変更する", () => {
    expect(clampZoom(10)).toBe(25);
    expect(clampZoom(450)).toBe(400);
    expect(stepZoom(100, 1)).toBe(125);
    expect(stepZoom(100, -1)).toBe(75);
    expect(stepZoom(390, 1)).toBe(400);
  });

  it("キャンバス全体が余白内へ収まる倍率を算出する", () => {
    expect(fitCanvasZoom({ width: 1000, height: 800 }, { width: 500, height: 400 }, 0)).toBe(50);
    expect(fitCanvasZoom({ width: 1000, height: 500 }, { width: 700, height: 700 }, 50)).toBe(60);
    expect(fitCanvasZoom({ width: 4000, height: 3000 }, { width: 200, height: 150 }, 0)).toBe(25);
  });
});
