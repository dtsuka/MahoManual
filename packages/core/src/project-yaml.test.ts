import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readAnnotationDefaults, readProjectTitle, writeAnnotationDefaults, writeProjectTheme, writeProjectTitle } from "./project.js";
import type { AnnotationDefaults } from "./annotation-defaults.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function createRoot(projectYaml?: string): string {
  const root = mkdtempSync(join(tmpdir(), "mahomanual-project-yaml-"));
  roots.push(root);
  if (projectYaml !== undefined) {
    writeFileSync(join(root, "project.yaml"), projectYaml, "utf8");
  }
  return root;
}

describe("clearing annotation settings when project.yaml has no collection", () => {
  const cases: Array<[string, string | undefined]> = [
    ["missing", undefined],
    ["empty", ""],
    ["comments only", "# メモだけ\n"],
    ["null", "null\n"],
  ];

  for (const [label, content] of cases) {
    it(`writeProjectTheme({}) works when project.yaml is ${label}`, () => {
      const root = createRoot(content);
      expect(writeProjectTheme(root, {})).toEqual({});
      if (content !== undefined) {
        expect(readFileSync(join(root, "project.yaml"), "utf8")).toContain(content.trim());
      }
    });

    it(`clearing does not write "null" and later writes still work when project.yaml is ${label}`, () => {
      const root = createRoot(content);
      writeProjectTheme(root, {});
      if (existsSync(join(root, "project.yaml"))) {
        expect(readFileSync(join(root, "project.yaml"), "utf8")).not.toMatch(/^null$/m);
      }
      writeProjectTitle(root, "新しい題名", "fallback");
      expect(readProjectTitle(root, "fallback")).toBe("新しい題名");
    });

    it(`writeAnnotationDefaults({}) works when project.yaml is ${label}`, () => {
      const root = createRoot(content);
      expect(writeAnnotationDefaults(root, {})).toEqual({});
    });
  }
});

describe("writeAnnotationDefaults validates its input", () => {
  it("rejects invalid defaults without changing project.yaml", () => {
    const root = createRoot("title: t\n");
    const invalid = [
      { badge: { size: -1 } },
      { unknownType: { color: "#ff0000" } },
      { badge: { unknownKey: 1 } },
    ];
    for (const value of invalid) {
      expect(() => writeAnnotationDefaults(root, value as unknown as AnnotationDefaults), JSON.stringify(value)).toThrow();
    }
    expect(readFileSync(join(root, "project.yaml"), "utf8")).toBe("title: t\n");
    expect(existsSync(join(root, "project.yaml"))).toBe(true);
  });

  it("writes valid defaults", () => {
    const root = createRoot("title: t\n");
    writeAnnotationDefaults(root, { badge: { size: 30 } } as AnnotationDefaults);
    expect(readAnnotationDefaults(root)).toEqual({ badge: { size: 30 } });
  });
});
