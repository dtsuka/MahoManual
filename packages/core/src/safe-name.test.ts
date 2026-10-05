import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as core from "./index.js";
import {
  assertSafeName,
  isSafeName,
  isSafeRelativePath,
  resolveInside,
  resolveProjectRoot,
} from "./safe-name.js";

describe("isSafeName", () => {
  it("accepts Japanese, letters, digits, hyphen and underscore", () => {
    for (const name of [
      "1-1",
      "1-1-r0",
      "1-1-image",
      "badge-1",
      "img-main",
      "b1",
      "new-project",
      "新規マニュアル",
      "施設_追加-2",
      "ガイド",
    ]) {
      expect(isSafeName(name), name).toBe(true);
    }
  });

  it("rejects separators, dots, quotes, angle brackets, whitespace and control characters", () => {
    for (const name of [
      "",
      ".",
      "..",
      "../evil",
      "a/b",
      "a\\b",
      "a..b",
      ".hidden",
      'a"b',
      "a'b",
      "a`b",
      "<svg>",
      "a>b",
      "a&b",
      "a b",
      "a\tb",
      "a\nb",
      "a\u0000b",
      "a#b",
      "a?b",
      "a%2e",
      "a:b",
    ]) {
      expect(isSafeName(name), JSON.stringify(name)).toBe(false);
    }
  });

  it("rejects values that are not strings", () => {
    expect(isSafeName(undefined)).toBe(false);
    expect(isSafeName(null)).toBe(false);
    expect(isSafeName(1)).toBe(false);
  });
});

describe("assertSafeName", () => {
  it("returns the name when it is safe", () => {
    expect(assertSafeName("1-1", "注釈ID")).toBe("1-1");
  });

  it("throws an error that includes the label", () => {
    expect(() => assertSafeName("../evil", "注釈ID")).toThrow(/注釈ID/);
    expect(() => assertSafeName("", "プロジェクトID")).toThrow(/プロジェクトID/);
  });
});

describe("isSafeRelativePath", () => {
  it("accepts project-relative paths", () => {
    for (const path of ["img/demo.png", "img/raw/1-1.png", "img/raw/日本語.png", "a.png"]) {
      expect(isSafeRelativePath(path), path).toBe(true);
    }
  });

  it("rejects absolute paths, parent segments, backslashes and hidden segments", () => {
    for (const path of [
      "",
      "/etc/passwd",
      "C:/secret.png",
      "C:\\secret.png",
      "c:secret.png",
      "\\\\server\\share.png",
      "..",
      "../secret.png",
      "img/../../secret.png",
      "img/..",
      "img\\raw\\a.png",
      "img//a.png",
      "./img/a.png",
      "img/./a.png",
      ".auth/state.json",
      "img/.hidden.png",
      "img/a\u0000.png",
    ]) {
      expect(isSafeRelativePath(path), JSON.stringify(path)).toBe(false);
    }
  });
});

describe("resolveInside", () => {
  it("resolves a relative path inside the base folder", () => {
    const base = resolve("/tmp/mm-base");
    expect(resolveInside(base, "img/a.png")).toBe(join(base, "img/a.png"));
  });

  it("throws when the path leaves the base folder", () => {
    const base = resolve("/tmp/mm-base");
    expect(() => resolveInside(base, "../outside.png")).toThrow();
    expect(() => resolveInside(base, "img/../../outside.png")).toThrow();
    expect(() => resolveInside(base, "/etc/passwd")).toThrow();
    expect(() => resolveInside(base, "")).toThrow();
  });
});

describe("resolveProjectRoot", () => {
  it("joins a safe project ID to the projects folder", () => {
    const projectsDir = resolve("/tmp/mm-projects");
    expect(resolveProjectRoot(projectsDir, "新規マニュアル")).toBe(join(projectsDir, "新規マニュアル"));
  });

  it("rejects unsafe project IDs", () => {
    const projectsDir = resolve("/tmp/mm-projects");
    expect(() => resolveProjectRoot(projectsDir, "../evil")).toThrow(/プロジェクトID/);
    expect(() => resolveProjectRoot(projectsDir, "a/b")).toThrow(/プロジェクトID/);
  });
});

describe("core index", () => {
  it("exports the name validation helpers", () => {
    expect(core.isSafeName).toBe(isSafeName);
    expect(core.assertSafeName).toBe(assertSafeName);
    expect(core.isSafeRelativePath).toBe(isSafeRelativePath);
    expect(core.resolveInside).toBe(resolveInside);
    expect(core.resolveProjectRoot).toBe(resolveProjectRoot);
  });
});
