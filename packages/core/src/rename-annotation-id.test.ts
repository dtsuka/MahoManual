import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildProject } from "./build.js";
import { renameAnnotationId } from "./project.js";

const fixtureImage = join(import.meta.dirname, "../tests/fixtures/projects/demo/img/demo.png");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function annotationWithImage(src: string) {
  return {
    version: 1,
    canvas: { width: 100, height: 50 },
    objects: [{ id: "img-main", type: "image", source: "manual", src, rect: { x: 0, y: 0, w: 100, h: 100 } }],
  };
}

function createProject(manual: string, annotations: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "mahomanual-rename-"));
  roots.push(root);
  mkdirSync(join(root, "annotations"), { recursive: true });
  mkdirSync(join(root, "img", "raw"), { recursive: true });
  writeFileSync(join(root, "manual.md"), manual, "utf8");
  for (const [id, src] of Object.entries(annotations)) {
    writeFileSync(join(root, "annotations", `${id}.json`), JSON.stringify(annotationWithImage(src)), "utf8");
    copyFileSync(fixtureImage, join(root, src));
  }
  return root;
}

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8")) as { objects: Array<{ src?: string }> };
}

describe("renameAnnotationId", () => {
  it("rewrites the fence src even with a trailing comment, quotes or list indentation", async () => {
    const manual = [
      "# T",
      "",
      "```annotated-image",
      "src: 1-1          # annotations/1-1.json を参照(必須)",
      "caption: 図1",
      "```",
      "",
      "1. 手順",
      "",
      "   ```annotated-image",
      '   src: "1-1"',
      "   ```",
      "",
      "```annotated-image",
      "src: 1-10",
      "```",
      "",
    ].join("\n");
    const root = createProject(manual, { "1-1": "img/raw/1-1.png", "1-10": "img/raw/1-10.png" });

    renameAnnotationId(root, "1-1", "intro");

    const next = readFileSync(join(root, "manual.md"), "utf8");
    expect(next).toContain("src: intro          # annotations/1-1.json を参照(必須)");
    expect(next).toContain('   src: "intro"');
    expect(next).toContain("src: 1-10\n");
    expect(next).not.toMatch(/src: "?1-1"?(\s|$)/m);
    await expect(buildProject(root, { outputDir: join(root, "dist") })).resolves.toBeDefined();
  });

  it("quotes a new ID that YAML would otherwise read as a number", () => {
    const root = createProject("```annotated-image\nsrc: a1\n```\n", { a1: "img/raw/a1.png" });

    renameAnnotationId(root, "a1", "123");

    expect(readFileSync(join(root, "manual.md"), "utf8")).toContain('src: "123"');
  });

  it("moves an image that only this annotation uses", () => {
    const root = createProject("```annotated-image\nsrc: 1-1\n```\n", { "1-1": "img/raw/1-1.png" });

    const updated = renameAnnotationId(root, "1-1", "intro");

    expect(updated.objects[0]).toMatchObject({ src: "img/raw/intro.png" });
    expect(existsSync(join(root, "img/raw/intro.png"))).toBe(true);
    expect(existsSync(join(root, "img/raw/1-1.png"))).toBe(false);
    expect(readdirSync(join(root, "annotations")).sort()).toEqual(["intro.json"]);
  });

  it("leaves an image in place when another annotation file also uses it", async () => {
    const root = createProject(
      "# T\n\n```annotated-image\nsrc: 1-1\n```\n\n```annotated-image\nsrc: 1-2\n```\n",
      { "1-1": "img/raw/1-1.png" },
    );
    writeFileSync(join(root, "annotations/1-2.json"), JSON.stringify(annotationWithImage("img/raw/1-1.png")), "utf8");

    const updated = renameAnnotationId(root, "1-1", "intro");

    expect(existsSync(join(root, "img/raw/1-1.png"))).toBe(true);
    expect(readJson(join(root, "annotations/1-2.json")).objects[0]?.src).toBe("img/raw/1-1.png");
    const src = updated.objects[0]?.type === "image" ? updated.objects[0].src : "";
    expect(existsSync(join(root, src))).toBe(true);
    expect(readdirSync(join(root, "annotations")).sort()).toEqual(["1-2.json", "intro.json"]);
    await expect(buildProject(root, { outputDir: join(root, "dist") })).resolves.toBeDefined();
  });

  it("leaves an image in place when manual.md refers to it directly", () => {
    const root = createProject(
      "# T\n\n![画面](img/1-1.png)\n\n```annotated-image\nsrc: 1-1\n```\n",
      { "1-1": "img/raw/1-1.png" },
    );
    copyFileSync(fixtureImage, join(root, "img/1-1.png"));

    renameAnnotationId(root, "1-1", "intro");

    expect(existsSync(join(root, "img/1-1.png"))).toBe(true);
    expect(readFileSync(join(root, "manual.md"), "utf8")).toContain("![画面](img/1-1.png)");
  });
});
