import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
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
});
