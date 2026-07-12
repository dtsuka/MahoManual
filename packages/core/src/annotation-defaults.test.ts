import { describe, expect, it } from "vitest";
import {
  applyObjectStyle,
  copyObjectStyle,
  extractObjectStyle,
  resolveCreationDefaults,
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
});
