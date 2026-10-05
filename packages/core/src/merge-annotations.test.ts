import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { expandCanvas } from "./expand-canvas.js";
import { mergeAnnotations } from "./merge-annotations.js";
import { parseAnnotation } from "./schema.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../tests/fixtures/annotations");

describe("mergeAnnotations", () => {
  it("replaces recipe objects, removes stale recipe indexes, keeps manual objects", () => {
    const existing = parseAnnotation(
      JSON.parse(readFileSync(join(fixturesDir, "merge-existing.json"), "utf8")),
    );
    const captured = parseAnnotation({
      version: 1,
      canvas: { width: 1280, height: 960 },
      objects: [
        {
          id: "1-1-r0",
          type: "badge",
          source: "recipe",
          recipeRef: "1-1#0",
          n: 1,
          at: { x: 11, y: 11 },
        },
        {
          id: "img-main",
          type: "image",
          source: "recipe",
          recipeRef: "1-1#image",
          src: "img/raw/1-1.png",
          rect: { x: 0, y: 0, w: 100, h: 100 },
          crop: { x: 0, y: 0, w: 2560, h: 1920 },
        },
      ],
    });

    const merged = mergeAnnotations(existing, captured, "1-1");
    expect(merged.objects.find((o) => o.id === "manual-1")).toEqual(existing.objects[2]);
    expect(merged.objects.find((o) => o.recipeRef === "1-1#1")).toBeUndefined();
    const replaced = merged.objects.find((o) => o.recipeRef === "1-1#0");
    expect(replaced?.type === "badge" ? replaced.at : undefined).toEqual({ x: 11, y: 11 });
    expect(merged.canvas).toEqual(captured.canvas);
  });

  it("keeps recipe image below manual objects after re-capture (draw order)", () => {
    // 配列順 = 描画順(後が上)。再撮影で recipe の image が manual 注釈より
    // 後ろに並ぶと、手動注釈が画像に隠れて見えなくなる
    const existing = parseAnnotation({
      version: 1,
      canvas: { width: 1280, height: 960 },
      objects: [
        {
          id: "1-1-image",
          type: "image",
          source: "recipe",
          recipeRef: "1-1#image",
          src: "img/raw/1-1.png",
          rect: { x: 0, y: 0, w: 100, h: 100 },
        },
        { id: "1-1-r0", type: "badge", source: "recipe", recipeRef: "1-1#0", n: 1, at: { x: 10, y: 10 } },
        { id: "manual-badge", type: "badge", source: "manual", n: 9, at: { x: 50, y: 50 } },
      ],
    });
    const captured = parseAnnotation({
      version: 1,
      canvas: { width: 1280, height: 960 },
      objects: [
        {
          id: "1-1-image",
          type: "image",
          source: "recipe",
          recipeRef: "1-1#image",
          src: "img/raw/1-1.png",
          rect: { x: 0, y: 0, w: 100, h: 100 },
        },
        { id: "1-1-r0", type: "badge", source: "recipe", recipeRef: "1-1#0", n: 1, at: { x: 12, y: 12 } },
      ],
    });

    const merged = mergeAnnotations(existing, captured, "1-1");
    const imageIndex = merged.objects.findIndex((o) => o.type === "image");
    const manualIndex = merged.objects.findIndex((o) => o.id === "manual-badge");
    const recipeBadgeIndex = merged.objects.findIndex((o) => o.id === "1-1-r0");
    expect(imageIndex).toBeGreaterThanOrEqual(0);
    expect(manualIndex).toBeGreaterThan(imageIndex);
    expect(recipeBadgeIndex).toBeGreaterThan(imageIndex);
  });
  describe("keeps the canvas margin added in the GUI (SPEC §4.5)", () => {
    function capturedFile(width: number, height: number) {
      return parseAnnotation({
        version: 1,
        canvas: { width, height },
        objects: [
          {
            id: "r-image",
            type: "image",
            source: "recipe",
            recipeRef: "r#image",
            locked: true,
            src: "img/raw/r.png",
            rect: { x: 0, y: 0, w: 100, h: 100 },
            crop: { x: 0, y: 0, w: width * 2, h: height * 2 },
          },
          // 画像上の (640px, 96px)
          { id: "r-r0", type: "badge", source: "recipe", recipeRef: "r#0", n: 1, at: { x: 50, y: (96 / height) * 100 } },
        ],
      });
    }

    function px(at: { x: number; y: number }, canvas: { width: number; height: number }) {
      return { x: (at.x / 100) * canvas.width, y: (at.y / 100) * canvas.height };
    }

    it("re-applies the margin and keeps manual objects at the same place", () => {
      const first = capturedFile(1280, 960);
      const edited = expandCanvas(first, { left: 320 });
      // 余白の中(画像の左)に置いた手動バッジ: canvas 上の (160px, 480px)
      edited.objects.push({ id: "m1", type: "badge", source: "manual", n: 2, at: { x: 10, y: 50 } });

      const merged = mergeAnnotations(edited, capturedFile(1280, 960), "r");
      expect(merged.canvas).toEqual({ width: 1600, height: 960 });
      const image = merged.objects.find((o) => o.id === "r-image");
      expect(image?.type === "image" ? image.rect.x : undefined).toBeCloseTo(20, 6);
      expect(image?.type === "image" ? image.rect.w : undefined).toBeCloseTo(80, 6);

      const manual = merged.objects.find((o) => o.id === "m1");
      const manualPx = px(manual?.type === "badge" ? manual.at : { x: 0, y: 0 }, merged.canvas);
      expect(manualPx.x).toBeCloseTo(160, 6);
      expect(manualPx.y).toBeCloseTo(480, 6);

      // レシピ由来の注釈も余白の分だけ右にある(画像上の同じ位置)
      const recipeBadge = merged.objects.find((o) => o.id === "r-r0");
      const recipePx = px(recipeBadge?.type === "badge" ? recipeBadge.at : { x: 0, y: 0 }, merged.canvas);
      expect(recipePx.x).toBeCloseTo(320 + 640, 6);
      expect(recipePx.y).toBeCloseTo(96, 6);
    });

    it("keeps manual objects at the same distance from the image when the screenshot size changes", () => {
      const edited = expandCanvas(capturedFile(1280, 960), { left: 320, top: 40 });
      // 画像の左上から (100px, 200px) の位置
      edited.objects.push({
        id: "m1",
        type: "badge",
        source: "manual",
        n: 2,
        at: { x: ((320 + 100) / 1600) * 100, y: ((40 + 200) / 1000) * 100 },
      });

      const merged = mergeAnnotations(edited, capturedFile(1300, 1200), "r");
      expect(merged.canvas).toEqual({ width: 1620, height: 1240 });
      const manual = merged.objects.find((o) => o.id === "m1");
      const manualPx = px(manual?.type === "badge" ? manual.at : { x: 0, y: 0 }, merged.canvas);
      expect(manualPx.x).toBeCloseTo(320 + 100, 6);
      expect(manualPx.y).toBeCloseTo(40 + 200, 6);
    });

    it("keeps the larger of the recipe margin and the previous margin", () => {
      // レシピの margin(左60px)で撮影 → GUIでさらに左へ100px広げた
      const recipeCaptured = expandCanvas(capturedFile(1280, 960), { left: 60 });
      const edited = expandCanvas(recipeCaptured, { left: 100 });
      const merged = mergeAnnotations(edited, expandCanvas(capturedFile(1280, 960), { left: 60 }), "r");
      expect(merged.canvas).toEqual({ width: 1440, height: 960 });
      const image = merged.objects.find((o) => o.id === "r-image");
      expect(image?.type === "image" ? (image.rect.x / 100) * merged.canvas.width : undefined).toBeCloseTo(160, 6);
    });
  });
});
