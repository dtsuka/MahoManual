import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { updateProjectTheme } from "./project-theme.js";

let root: string;
const yamlPath = () => join(root, "project.yaml");

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "mahomanual-theme-"));
  writeFileSync(join(root, "manual.md"), "# T\n");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("updateProjectTheme", () => {
  it("saves color, font size and validated defaults", () => {
    writeFileSync(yamlPath(), "title: t\n");
    const result = updateProjectTheme(root, {
      color: "#ff6600",
      fontSize: 18,
      defaults: { badge: { size: 30 } },
    });
    expect(result).toEqual({
      theme: { color: "#ff6600", fontSize: 18 },
      defaults: { badge: { size: 30 } },
    });
    const yaml = readFileSync(yamlPath(), "utf8");
    expect(yaml).toContain("title: t");
    expect(yaml).toContain("#ff6600");
    expect(yaml).toContain("size: 30");
  });

  it("resets to the built-in theme on a project without project.yaml", () => {
    expect(updateProjectTheme(root, {})).toEqual({ theme: {}, defaults: {} });
    expect(updateProjectTheme(root, { defaults: null })).toEqual({ theme: {}, defaults: {} });
    expect(updateProjectTheme(root, { defaults: {} })).toEqual({ theme: {}, defaults: {} });
  });

  it("resets to the built-in theme when project.yaml has only comments", () => {
    writeFileSync(yamlPath(), "# only a comment\n");
    expect(updateProjectTheme(root, {})).toEqual({ theme: {}, defaults: {} });
    expect(readFileSync(yamlPath(), "utf8")).toContain("# only a comment");
  });

  it("writes nothing when the defaults are invalid", () => {
    writeFileSync(yamlPath(), "title: t\n");
    for (const defaults of [{ badge: { size: "huge" } }, { bogus: 1 }, "x"]) {
      expect(() => updateProjectTheme(root, { color: "#ff6600", defaults })).toThrow();
    }
    expect(readFileSync(yamlPath(), "utf8")).toBe("title: t\n");
  });

  it("writes nothing when the color or font size is invalid", () => {
    for (const update of [{ color: "pink" }, { fontSize: -1 }]) {
      expect(() => updateProjectTheme(root, { ...update, defaults: { badge: { size: 30 } } })).toThrow();
    }
    expect(existsSync(yamlPath())).toBe(false);
  });

  it("keeps the stored defaults when defaults is omitted", () => {
    writeFileSync(yamlPath(), "title: t\nannotation:\n  defaults:\n    frame:\n      strokeWidth: 3\n");
    expect(updateProjectTheme(root, { color: "#123456" })).toEqual({
      theme: { color: "#123456" },
      defaults: { frame: { strokeWidth: 3 } },
    });
  });
});
