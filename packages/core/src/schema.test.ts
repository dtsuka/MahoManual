import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseAnnotation } from "./schema.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../tests/fixtures/annotations");

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, name), "utf8"));
}

describe("parseAnnotation", () => {
  it("parses valid basic fixture (SPEC §4.3)", () => {
    const result = parseAnnotation(loadFixture("valid-basic.json"));
    expect(result.version).toBe(1);
    expect(result.canvas).toEqual({ width: 1280, height: 960 });
    expect(result.objects).toHaveLength(5);
  });

  it("parses valid two-column composite fixture (SPEC §4.4)", () => {
    const result = parseAnnotation(loadFixture("valid-two-column.json"));
    expect(result.canvas).toEqual({ width: 1290, height: 1043 });
    expect(result.objects.filter((o) => o.type === "image")).toHaveLength(2);
  });

  it("parses minimal fixture (canvas + empty objects)", () => {
    const result = parseAnnotation(loadFixture("valid-minimal.json"));
    expect(result.canvas).toEqual({ width: 800, height: 600 });
    expect(result.objects).toEqual([]);
  });

  it("parses optional object lock and rejects non-boolean values", () => {
    const valid = loadFixture("valid-basic.json") as {
      objects: Array<Record<string, unknown>>;
    };
    valid.objects[0]!.locked = true;
    expect(parseAnnotation(valid).objects[0]).toMatchObject({ locked: true });

    valid.objects[0]!.locked = "yes";
    expect(() => parseAnnotation(valid)).toThrow(/型が不正/);
  });

  it("parses optional arrow heads and rejects invalid values", () => {
    const arrow = {
      version: 1,
      canvas: { width: 100, height: 100 },
      objects: [
        {
          id: "a1",
          type: "arrow",
          source: "manual",
          points: [{ x: 0, y: 0 }, { x: 50, y: 50 }],
        },
      ],
    };
    expect(parseAnnotation(arrow).objects[0]).toMatchObject({ type: "arrow" });
    expect(parseAnnotation({
      ...arrow,
      objects: [{ ...arrow.objects[0]!, arrowHeads: "both" }],
    }).objects[0]).toMatchObject({ arrowHeads: "both" });
    expect(() => parseAnnotation({
      ...arrow,
      objects: [{ ...arrow.objects[0]!, arrowHeads: "middle" }],
    })).toThrow(/arrowHeads/);
  });

  it("parses text objects with a textbox rectangle while keeping the legacy anchor", () => {
    const annotation = parseAnnotation({
      version: 1,
      canvas: { width: 800, height: 600 },
      objects: [{
        id: "t1",
        type: "text",
        source: "manual",
        content: "複数行\nテキスト",
        at: { x: 30, y: 25 },
        rect: { x: 20, y: 20, w: 30, h: 12 },
        textAlign: "center",
        verticalAlign: "middle",
        padding: 8,
        borderColor: "#112233",
        borderWidth: 2,
        borderRadius: 4,
      }],
    });

    expect(annotation.objects[0]).toMatchObject({
      type: "text",
      at: { x: 30, y: 25 },
      rect: { x: 20, y: 20, w: 30, h: 12 },
      textAlign: "center",
      verticalAlign: "middle",
      padding: 8,
      borderColor: "#112233",
      borderWidth: 2,
      borderRadius: 4,
    });
  });

  it("parses mosaic objects and validates their image target and block size", () => {
    const base = {
      version: 1,
      canvas: { width: 100, height: 100 },
      objects: [
        {
          id: "img-main",
          type: "image",
          source: "manual",
          src: "img/raw/a.png",
          rect: { x: 0, y: 0, w: 100, h: 100 },
        },
        {
          id: "m1",
          type: "mosaic",
          source: "manual",
          targetImageId: "img-main",
          rect: { x: 10, y: 20, w: 30, h: 15 },
          blockSize: 8,
        },
      ],
    };
    expect(parseAnnotation(base).objects[1]).toMatchObject({ type: "mosaic", blockSize: 8 });
    expect(() => parseAnnotation({
      ...base,
      objects: base.objects.map((obj) => obj.id === "m1" ? { ...obj, targetImageId: "missing" } : obj),
    })).toThrow(/targetImageId/);
    expect(() => parseAnnotation({
      ...base,
      objects: base.objects.map((obj) => obj.id === "m1" ? { ...obj, blockSize: 1 } : obj),
    })).toThrow(/blockSize/);
  });

  it("rejects duplicate object ids", () => {
    expect(() =>
      parseAnnotation({
        version: 1,
        canvas: { width: 100, height: 100 },
        objects: [
          { id: "a", type: "badge", source: "manual", n: 1, at: { x: 10, y: 10 } },
          { id: "a", type: "badge", source: "manual", n: 2, at: { x: 20, y: 20 } },
        ],
      }),
    ).toThrow(/id/i);
  });

  it("rejects version !== 1", () => {
    expect(() =>
      parseAnnotation({
        version: 2,
        canvas: { width: 100, height: 100 },
        objects: [],
      }),
    ).toThrow(/version/i);
  });

  it("rejects line with only one point", () => {
    expect(() =>
      parseAnnotation({
        version: 1,
        canvas: { width: 100, height: 100 },
        objects: [
          {
            id: "l1",
            type: "line",
            source: "manual",
            points: [{ x: 10, y: 10 }],
          },
        ],
      }),
    ).toThrow(/points/i);
  });

  it("rejects rect with w <= 0", () => {
    expect(() =>
      parseAnnotation({
        version: 1,
        canvas: { width: 100, height: 100 },
        objects: [
          {
            id: "f1",
            type: "frame",
            source: "manual",
            rect: { x: 0, y: 0, w: 0, h: 10 },
          },
        ],
      }),
    ).toThrow(/w/i);
  });

  it("rejects crop with negative x/y (SPEC §4.5: 余白はcropで表現しない)", () => {
    const withCrop = (crop: { x: number; y: number; w: number; h: number }) => ({
      version: 1,
      canvas: { width: 100, height: 100 },
      objects: [
        {
          id: "img",
          type: "image",
          source: "manual",
          src: "img/raw/a.png",
          rect: { x: 0, y: 0, w: 100, h: 100 },
          crop,
        },
      ],
    });
    expect(() => parseAnnotation(withCrop({ x: -10, y: 0, w: 100, h: 100 }))).toThrow(/crop/i);
    expect(() => parseAnnotation(withCrop({ x: 0, y: -10, w: 100, h: 100 }))).toThrow(/crop/i);
    expect(parseAnnotation(withCrop({ x: 0, y: 0, w: 100, h: 100 })).objects).toHaveLength(1);
  });

  it("rejects invalid color", () => {
    expect(() =>
      parseAnnotation({
        version: 1,
        canvas: { width: 100, height: 100 },
        objects: [
          {
            id: "b1",
            type: "badge",
            source: "manual",
            n: 1,
            at: { x: 10, y: 10 },
            color: "pink",
          },
        ],
      }),
    ).toThrow(/color/i);
  });

  it("rejects unknown object type", () => {
    expect(() =>
      parseAnnotation({
        version: 1,
        canvas: { width: 100, height: 100 },
        objects: [{ id: "x1", type: "ellipse", source: "manual" }],
      }),
    ).toThrow(/type/i);
  });

  it("accepts badge fontSize", () => {
    const parsed = parseAnnotation({
      version: 1,
      canvas: { width: 100, height: 100 },
      objects: [{ id: "b1", type: "badge", source: "manual", n: 1, at: { x: 1, y: 1 }, fontSize: 18 }],
    });
    const badge = parsed.objects[0];
    expect(badge?.type === "badge" ? badge.fontSize : undefined).toBe(18);
  });

  it("accepts cursor annotations and rejects unknown cursor icons", () => {
    const parsed = parseAnnotation({
      version: 1,
      canvas: { width: 100, height: 100 },
      objects: [
        {
          id: "c1",
          type: "cursor",
          source: "manual",
          icon: "move",
          at: { x: 25, y: 30 },
          size: 32,
          color: "#112233",
        },
      ],
    });
    expect(parsed.objects[0]).toMatchObject({ type: "cursor", icon: "move", size: 32 });

    expect(() =>
      parseAnnotation({
        version: 1,
        canvas: { width: 100, height: 100 },
        objects: [
          { id: "c1", type: "cursor", source: "manual", icon: "unknown", at: { x: 1, y: 1 } },
        ],
      }),
    ).toThrow(/icon|許可/);
  });

  it("rejects recipe-sourced object without recipeRef", () => {
    // recipeRef の無い recipe オブジェクトは再撮影マージで置換も削除もされない
    // ゾンビになるため、スキーマで拒否する
    expect(() =>
      parseAnnotation({
        version: 1,
        canvas: { width: 100, height: 100 },
        objects: [{ id: "r1", type: "badge", source: "recipe", n: 1, at: { x: 1, y: 1 } }],
      }),
    ).toThrow(/recipeRef/);
  });

  it("reports validation issues in Japanese (SPEC §8)", () => {
    try {
      parseAnnotation({
        version: 1,
        canvas: { width: 100, height: 100 },
        // at が欠落
        objects: [{ id: "b1", type: "badge", source: "manual", n: 1 }],
      });
      expect.fail("should throw");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toMatch(/必須/);
    }
  });

  it("includes all validation issues in error message", () => {
    try {
      parseAnnotation({
        version: 2,
        canvas: { width: 0, height: 100 },
        objects: [
          { id: "a", type: "badge", source: "manual", n: 0, at: { x: 10, y: 10 } },
          { id: "a", type: "badge", source: "manual", n: 1, at: { x: 20, y: 20 } },
        ],
      });
      expect.fail("should throw");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toMatch(/version/i);
      expect(message).toMatch(/canvas/i);
      expect(message).toMatch(/id/i);
    }
  });
});
