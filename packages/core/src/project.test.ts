import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createManualProject,
  readAnnotationFile,
  readProjectTheme,
  renumberAllBadgesFiles,
  renumberBadges,
  writeProjectTheme,
} from "./project.js";

describe("createManualProject", () => {
  it("creates the standard project structure with the specified title", () => {
    const projectsRoot = mkdtempSync(join(tmpdir(), "mahomanual-projects-"));
    try {
      const root = createManualProject(projectsRoot, "new-project", "新規マニュアル");
      expect(existsSync(join(root, "annotations"))).toBe(true);
      expect(existsSync(join(root, "img/raw"))).toBe(true);
      expect(existsSync(join(root, "captures"))).toBe(true);
      expect(readFileSync(join(root, "project.yaml"), "utf8")).toContain("新規マニュアル");
      expect(readFileSync(join(root, "manual.md"), "utf8")).toContain("# 新規マニュアル");
      expect(() => createManualProject(projectsRoot, "new-project", "duplicate")).toThrow(
        /既に存在/,
      );
    } finally {
      rmSync(projectsRoot, { recursive: true, force: true });
    }
  });
});

describe("renumberBadges", () => {
  it("renumbers badges in array order starting from 1", () => {
    const result = renumberBadges({
      version: 1,
      canvas: { width: 100, height: 100 },
      objects: [
        { id: "b1", type: "badge", source: "manual", n: 5, at: { x: 10, y: 10 } },
        { id: "t1", type: "text", source: "manual", content: "x", at: { x: 20, y: 20 } },
        { id: "b2", type: "badge", source: "manual", n: 2, at: { x: 30, y: 30 } },
        { id: "b3", type: "badge", source: "manual", n: 9, at: { x: 40, y: 40 } },
      ],
    });

    const badges = result.objects.filter((obj) => obj.type === "badge");
    expect(badges.map((obj) => obj.n)).toEqual([1, 2, 3]);
  });
});

describe("readProjectTheme", () => {
  it("reads annotation color and fontSize from project.yaml", () => {
    const root = mkdtempSync(join(tmpdir(), "mahomanual-theme-"));
    try {
      writeFileSync(
        join(root, "project.yaml"),
        "title: t\nannotation:\n  color: \"#112233\"\n  fontSize: 16\n",
        "utf8",
      );
      expect(readProjectTheme(root)).toEqual({ color: "#112233", fontSize: 16 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("ignores invalid values and missing sections", () => {
    const root = mkdtempSync(join(tmpdir(), "mahomanual-theme-bad-"));
    try {
      writeFileSync(
        join(root, "project.yaml"),
        "title: t\nannotation:\n  color: pink\n  fontSize: -1\n",
        "utf8",
      );
      expect(readProjectTheme(root)).toEqual({});
      rmSync(join(root, "project.yaml"));
      expect(readProjectTheme(root)).toEqual({});
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("writeProjectTheme", () => {
  it("writes annotation color and fontSize preserving other keys and comments", () => {
    const root = mkdtempSync(join(tmpdir(), "mahomanual-theme-write-"));
    try {
      writeFileSync(
        join(root, "project.yaml"),
        "# 手書きコメント\ntitle: 元のタイトル\n",
        "utf8",
      );
      writeProjectTheme(root, { color: "#112233", fontSize: 16 });

      expect(readProjectTheme(root)).toEqual({ color: "#112233", fontSize: 16 });
      const yaml = readFileSync(join(root, "project.yaml"), "utf8");
      expect(yaml).toContain("# 手書きコメント");
      expect(yaml).toContain("元のタイトル");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("removes omitted keys and drops the annotation section when empty", () => {
    const root = mkdtempSync(join(tmpdir(), "mahomanual-theme-clear-"));
    try {
      writeFileSync(
        join(root, "project.yaml"),
        'title: t\nannotation:\n  color: "#112233"\n  fontSize: 16\n',
        "utf8",
      );
      writeProjectTheme(root, { color: "#445566" });
      expect(readProjectTheme(root)).toEqual({ color: "#445566" });
      expect(readFileSync(join(root, "project.yaml"), "utf8")).not.toContain("fontSize");

      writeProjectTheme(root, {});
      expect(readProjectTheme(root)).toEqual({});
      expect(readFileSync(join(root, "project.yaml"), "utf8")).not.toContain("annotation");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps unknown annotation keys when updating", () => {
    const root = mkdtempSync(join(tmpdir(), "mahomanual-theme-keep-"));
    try {
      writeFileSync(
        join(root, "project.yaml"),
        'title: t\nannotation:\n  color: "#112233"\n  custom: keep-me\n',
        "utf8",
      );
      writeProjectTheme(root, { fontSize: 18 });
      const yaml = readFileSync(join(root, "project.yaml"), "utf8");
      expect(yaml).toContain("custom: keep-me");
      expect(readProjectTheme(root)).toEqual({ fontSize: 18 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects invalid color and fontSize", () => {
    const root = mkdtempSync(join(tmpdir(), "mahomanual-theme-invalid-"));
    try {
      writeFileSync(join(root, "project.yaml"), "title: t\n", "utf8");
      expect(() => writeProjectTheme(root, { color: "pink" })).toThrow(/カラー/);
      expect(() => writeProjectTheme(root, { fontSize: -1 })).toThrow(/フォントサイズ/);
      expect(() => writeProjectTheme(root, { fontSize: Number.NaN })).toThrow(/フォントサイズ/);
      // 失敗時はファイルを変更しない
      expect(readFileSync(join(root, "project.yaml"), "utf8")).toBe("title: t\n");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("creates project.yaml when it does not exist", () => {
    const root = mkdtempSync(join(tmpdir(), "mahomanual-theme-new-"));
    try {
      writeProjectTheme(root, { color: "#aabbcc" });
      expect(readProjectTheme(root)).toEqual({ color: "#aabbcc" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("renumberAllBadgesFiles", () => {
  it("renumbers every annotation file and returns total badge count", () => {
    const root = mkdtempSync(join(tmpdir(), "mahomanual-renumber-all-"));
    try {
      mkdirSync(join(root, "annotations"), { recursive: true });
      writeFileSync(join(root, "manual.md"), "# t\n\n①②③\n", "utf8");
      const annotation = (badgeNs: number[]) => ({
        version: 1,
        canvas: { width: 100, height: 100 },
        objects: badgeNs.map((n, i) => ({
          id: `b${i}`,
          type: "badge",
          source: "manual",
          n,
          at: { x: 10, y: 10 },
        })),
      });
      writeFileSync(join(root, "annotations/a.json"), JSON.stringify(annotation([7, 3])), "utf8");
      writeFileSync(join(root, "annotations/b.json"), JSON.stringify(annotation([9])), "utf8");

      const result = renumberAllBadgesFiles(root);

      expect(result.totalBadges).toBe(3);
      const a = readAnnotationFile(root, "a");
      const b = readAnnotationFile(root, "b");
      expect(a.objects.map((o) => (o.type === "badge" ? o.n : -1))).toEqual([1, 2]);
      expect(b.objects.map((o) => (o.type === "badge" ? o.n : -1))).toEqual([1]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
