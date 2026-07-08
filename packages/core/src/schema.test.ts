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
