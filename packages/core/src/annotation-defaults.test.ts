import { describe, expect, it } from "vitest";
import {
  applyObjectStyle,
  copyObjectStyle,
  extractObjectStyle,
  parseAnnotationDefaults,
  resolveCreationDefaults,
  validateAnnotationDefaults,
} from "./annotation-defaults.js";

describe("resolveCreationDefaults", () => {
  it("applies priority objectPatch > projectDefaults > theme > core", () => {
    const resolved = resolveCreationDefaults("badge", {
      objectPatch: { color: "#111111" },
      projectDefaults: { badge: { color: "#222222", size: 30 } },
      theme: { color: "#333333", fontSize: 18 },
    });
    expect(resolved).toMatchObject({
      color: "#111111",
      size: 30,
      fontSize: 18,
    });
  });
});

describe("extractObjectStyle / applyObjectStyle", () => {
  it("copies style fields only", () => {
    const from = {
      id: "b1",
      type: "badge" as const,
      source: "manual" as const,
      n: 1,
      at: { x: 10, y: 20 },
      color: "#ff0000",
      size: 24,
    };
    const to = {
      id: "b2",
      type: "badge" as const,
      source: "manual" as const,
      n: 2,
      at: { x: 30, y: 40 },
    };
    const copied = copyObjectStyle(from, to);
    expect(copied).toMatchObject({ color: "#ff0000", size: 24, at: { x: 30, y: 40 }, n: 2 });
  });
});

describe("applyObjectStyle", () => {
  it("does not copy id or position", () => {
    const style = extractObjectStyle({
      id: "t1",
      type: "text",
      source: "manual",
      content: "hello",
      at: { x: 1, y: 2 },
      color: "#123456",
      fontSize: 16,
    });
    expect(style).toEqual({ color: "#123456", fontSize: 16 });
  });

  it("copies text box presentation without copying content or geometry", () => {
    const copied = copyObjectStyle({
      id: "t1",
      type: "text",
      source: "manual",
      content: "from",
      at: { x: 1, y: 2 },
      rect: { x: 2, y: 3, w: 20, h: 8 },
      textAlign: "center",
      verticalAlign: "middle",
      padding: 6,
      borderColor: "#112233",
      borderWidth: 2,
      borderRadius: 4,
    }, {
      id: "t2",
      type: "text",
      source: "manual",
      content: "to",
      at: { x: 30, y: 40 },
      rect: { x: 10, y: 20, w: 30, h: 10 },
    });
    expect(copied).toMatchObject({
      content: "to",
      at: { x: 30, y: 40 },
      rect: { x: 10, y: 20, w: 30, h: 10 },
      textAlign: "center",
      verticalAlign: "middle",
      padding: 6,
      borderColor: "#112233",
      borderWidth: 2,
      borderRadius: 4,
    });
  });

  it("ignores style fields unsupported by the target object type", () => {
    const badge = {
      id: "b1",
      type: "badge" as const,
      source: "manual" as const,
      n: 1,
      at: { x: 1, y: 2 },
    };
    expect(applyObjectStyle(badge, { color: "#123456", strokeWidth: 8 })).toEqual({
      ...badge,
      color: "#123456",
    });
  });

  it("returns only creation fields supported by the requested type", () => {
    expect(resolveCreationDefaults("cursor", { theme: { color: "#123456", fontSize: 18 } })).toEqual({
      color: "#123456",
      size: 28,
      icon: "pointer",
    });
  });
});

describe("validateAnnotationDefaults", () => {
  it("accepts valid defaults for each object type", () => {
    const defaults = {
      badge: { color: "#E91E8C", size: 22, fontSize: 14 },
      text: { textAlign: "left", verticalAlign: "top", padding: 0, borderWidth: 0, background: "#ffffff" },
      cursor: { icon: "pointer", size: 28 },
      frame: { strokeWidth: 2, radius: 4 },
      line: { color: "#000", strokeWidth: 1 },
      arrow: { arrowHeads: "both" },
      mosaic: { blockSize: 12 },
    };
    expect(validateAnnotationDefaults(defaults)).toEqual(defaults);
  });

  it("rejects unknown object types, unknown fields and wrong value types", () => {
    for (const value of [
      null,
      [],
      "badge",
      { bogus: { color: "#ffffff" } },
      { badge: { size: "huge" } },
      { badge: { color: 42 } },
      { badge: { color: "pink" } },
      { badge: { strokeWidth: 2 } },
      { text: { textAlign: "justify" } },
      { cursor: { icon: "hand" } },
      { frame: { strokeWidth: 0 } },
      { mosaic: { blockSize: 1 } },
      { image: {} },
    ]) {
      expect(() => validateAnnotationDefaults(value), JSON.stringify(value)).toThrow();
    }
  });
});

describe("parseAnnotationDefaults", () => {
  it("keeps valid fields and drops invalid ones when reading project.yaml", () => {
    expect(
      parseAnnotationDefaults({
        badge: { color: "#123456", size: "huge" },
        text: "not an object",
        bogus: { color: "#ffffff" },
        frame: { strokeWidth: 3, unknown: true },
      }),
    ).toEqual({ badge: { color: "#123456" }, frame: { strokeWidth: 3 } });
    expect(parseAnnotationDefaults(null)).toEqual({});
    expect(parseAnnotationDefaults([1, 2])).toEqual({});
  });
});
