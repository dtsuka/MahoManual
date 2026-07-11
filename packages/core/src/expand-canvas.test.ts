import { describe, expect, it } from "vitest";
import { expandCanvas } from "./expand-canvas.js";
import { parseAnnotation, type AnnotationFile } from "./schema.js";

// SPEC §4.5: canvas 1280×960 に全面配置した画像+各種注釈のフィクスチャ
function baseAnnotation(): AnnotationFile {
  return parseAnnotation({
    version: 1,
    canvas: { width: 1280, height: 960 },
    objects: [
      {
        id: "img-main",
        type: "image",
        source: "manual",
        src: "img/raw/menu.png",
        rect: { x: 0, y: 0, w: 100, h: 100 },
        crop: { x: 0, y: 120, w: 2560, h: 1920 },
      },
      { id: "b1", type: "badge", source: "manual", n: 1, at: { x: 17.3, y: 16 }, size: 22, fontSize: 14 },
      { id: "t1", type: "text", source: "manual", content: "メモ", at: { x: 50, y: 20 }, fontSize: 14 },
      { id: "c1", type: "cursor", source: "manual", icon: "pointer", at: { x: 40, y: 60 }, size: 24 },
      { id: "f1", type: "frame", source: "manual", rect: { x: 10, y: 20, w: 40, h: 30 }, strokeWidth: 2 },
      {
        id: "l1",
        type: "line",
        source: "manual",
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 50 },
        ],
        strokeWidth: 3,
      },
      {
        id: "a1",
        type: "arrow",
        source: "manual",
        points: [
          { x: 25, y: 75 },
          { x: 50, y: 75 },
          { x: 50, y: 25 },
        ],
      },
    ],
  });
}

function findObject<T extends AnnotationFile["objects"][number]["type"]>(
  annotation: AnnotationFile,
  id: string,
  type: T,
) {
  const obj = annotation.objects.find((o) => o.id === id);
  if (!obj || obj.type !== type) {
    throw new Error(`fixture object not found: ${id} (${type})`);
  }
  return obj as Extract<AnnotationFile["objects"][number], { type: T }>;
}

describe("expandCanvas", () => {
  it("adds left margin: canvas widens and image rect is offset (SPEC §4.5)", () => {
    const result = expandCanvas(baseAnnotation(), { left: 320 });

    expect(result.canvas).toEqual({ width: 1600, height: 960 });
    const image = findObject(result, "img-main", "image");
    expect(image.rect.x).toBeCloseTo(20, 10);
    expect(image.rect.y).toBeCloseTo(0, 10);
    expect(image.rect.w).toBeCloseTo(80, 10);
    expect(image.rect.h).toBeCloseTo(100, 10);
  });

  it("keeps on-canvas pixel positions of all object kinds (at / rect / points)", () => {
    const result = expandCanvas(baseAnnotation(), { left: 320 });

    // badge: x = (17.3% * 1280px + 320px) / 1600px = 33.84%、yは不変
    const badge = findObject(result, "b1", "badge");
    expect(badge.at.x).toBeCloseTo(33.84, 10);
    expect(badge.at.y).toBeCloseTo(16, 10);

    // frame: 位置はオフセット、幅は新canvas比で縮む(px寸法は同じ)
    const frame = findObject(result, "f1", "frame");
    expect(frame.rect.x).toBeCloseTo((10 * 12.8 + 320) / 16, 10);
    expect(frame.rect.y).toBeCloseTo(20, 10);
    expect(frame.rect.w).toBeCloseTo(32, 10); // 40% * 1280 / 1600
    expect(frame.rect.h).toBeCloseTo(30, 10);

    // line/arrow: 全pointsを変換
    const line = findObject(result, "l1", "line");
    expect(line.points[0]!.x).toBeCloseTo(20, 10);
    expect(line.points[0]!.y).toBeCloseTo(0, 10);
    expect(line.points[1]!.x).toBeCloseTo(100, 10);
    expect(line.points[1]!.y).toBeCloseTo(50, 10);
    const arrow = findObject(result, "a1", "arrow");
    expect(arrow.points[2]!.x).toBeCloseTo((50 * 12.8 + 320) / 16, 10);
    expect(arrow.points[2]!.y).toBeCloseTo(25, 10);
  });

  it("adds top margin: y coordinates are remapped, x unchanged", () => {
    const result = expandCanvas(baseAnnotation(), { top: 240 });

    expect(result.canvas).toEqual({ width: 1280, height: 1200 });
    const badge = findObject(result, "b1", "badge");
    expect(badge.at.x).toBeCloseTo(17.3, 10);
    expect(badge.at.y).toBeCloseTo((16 * 9.6 + 240) / 12, 10);
    const frame = findObject(result, "f1", "frame");
    expect(frame.rect.h).toBeCloseTo(24, 10); // 30% * 960 / 1200
  });

  it("right/bottom margins change canvas size without moving the origin", () => {
    const result = expandCanvas(baseAnnotation(), { right: 320, bottom: 240 });

    expect(result.canvas).toEqual({ width: 1600, height: 1200 });
    const image = findObject(result, "img-main", "image");
    expect(image.rect.x).toBeCloseTo(0, 10);
    expect(image.rect.y).toBeCloseTo(0, 10);
    expect(image.rect.w).toBeCloseTo(80, 10);
    expect(image.rect.h).toBeCloseTo(80, 10);
  });

  it("keeps px-based values unchanged (crop / size / fontSize / strokeWidth)", () => {
    const result = expandCanvas(baseAnnotation(), { top: 100, right: 50, bottom: 50, left: 100 });

    const image = findObject(result, "img-main", "image");
    expect(image.crop).toEqual({ x: 0, y: 120, w: 2560, h: 1920 });
    const badge = findObject(result, "b1", "badge");
    expect(badge.size).toBe(22);
    expect(badge.fontSize).toBe(14);
    const text = findObject(result, "t1", "text");
    expect(text.fontSize).toBe(14);
    expect(text.content).toBe("メモ");
    const cursor = findObject(result, "c1", "cursor");
    expect(cursor.size).toBe(24);
    const line = findObject(result, "l1", "line");
    expect(line.strokeWidth).toBe(3);
  });

  it("negative margin shrinks the canvas (inverse of expansion)", () => {
    const expanded = expandCanvas(baseAnnotation(), { left: 320, top: 240 });
    const restored = expandCanvas(expanded, { left: -320, top: -240 });

    expect(restored.canvas).toEqual({ width: 1280, height: 960 });
    const badge = findObject(restored, "b1", "badge");
    expect(badge.at.x).toBeCloseTo(17.3, 10);
    expect(badge.at.y).toBeCloseTo(16, 10);
    const image = findObject(restored, "img-main", "image");
    expect(image.rect.x).toBeCloseTo(0, 10);
    expect(image.rect.w).toBeCloseTo(100, 10);
  });

  it("does not mutate the input annotation", () => {
    const input = baseAnnotation();
    const snapshot = structuredClone(input);
    expandCanvas(input, { left: 320, top: 240 });
    expect(input).toEqual(snapshot);
  });

  it("rejects margins that make the canvas size non-positive", () => {
    expect(() => expandCanvas(baseAnnotation(), { left: -1280 })).toThrow(/canvas/i);
    expect(() => expandCanvas(baseAnnotation(), { top: -500, bottom: -500 })).toThrow(/canvas/i);
  });

  it("rejects non-finite margin values", () => {
    expect(() => expandCanvas(baseAnnotation(), { left: Number.NaN })).toThrow(/margin/i);
    expect(() => expandCanvas(baseAnnotation(), { right: Number.POSITIVE_INFINITY })).toThrow(/margin/i);
  });
});
