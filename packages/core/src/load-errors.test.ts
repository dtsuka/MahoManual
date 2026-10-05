import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { buildProject } from "./build.js";
import { listRecipeFiles, readAnnotationFile, runProjectCapture, setCrop } from "./project.js";

// demo.png は 200×100 px
const fixtureImage = join(import.meta.dirname, "../tests/fixtures/projects/demo/img/demo.png");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function createProject(): string {
  const root = mkdtempSync(join(tmpdir(), "mahomanual-load-errors-"));
  roots.push(root);
  mkdirSync(join(root, "annotations"), { recursive: true });
  mkdirSync(join(root, "img/raw"), { recursive: true });
  mkdirSync(join(root, "captures"), { recursive: true });
  copyFileSync(fixtureImage, join(root, "img/raw/a.png"));
  writeFileSync(join(root, "manual.md"), "# T\n\n```annotated-image\nsrc: a1\n```\n", "utf8");
  writeFileSync(
    join(root, "annotations/a1.json"),
    JSON.stringify({
      version: 1,
      canvas: { width: 100, height: 50 },
      objects: [{ id: "img", type: "image", source: "manual", src: "img/raw/a.png", rect: { x: 0, y: 0, w: 100, h: 100 } }],
    }),
    "utf8",
  );
  return root;
}

describe("setCrop", () => {
  it("rejects a crop outside the image without changing the file", () => {
    const root = createProject();
    const before = readFileSync(join(root, "annotations/a1.json"), "utf8");

    expect(() => setCrop(root, "a1", "img", { x: 0, y: 0, w: 201, h: 100 })).toThrow(/img\/raw\/a\.png/);
    expect(() => setCrop(root, "a1", "img", { x: 150, y: 50, w: 100, h: 10 })).toThrow();
    expect(() => setCrop(root, "a1", "img", { x: -1, y: 0, w: 10, h: 10 })).toThrow();
    expect(readFileSync(join(root, "annotations/a1.json"), "utf8")).toBe(before);
  });

  it("accepts a crop inside the image", () => {
    const root = createProject();
    const updated = setCrop(root, "a1", "img", { x: 10, y: 20, w: 190, h: 80 });
    expect(updated.objects[0]).toMatchObject({ crop: { x: 10, y: 20, w: 190, h: 80 } });
  });
});

describe("load errors include the file name (SPEC §8)", () => {
  it("names the annotation file on a JSON syntax error", async () => {
    const root = createProject();
    writeFileSync(join(root, "annotations/a1.json"), "{ broken", "utf8");
    expect(() => readAnnotationFile(root, "a1")).toThrow(/annotations\/a1\.json/);
    await expect(buildProject(root, { outputDir: join(root, "dist") })).rejects.toThrow(/annotations\/a1\.json/);
  });

  it("names the annotation file on a schema error", async () => {
    const root = createProject();
    writeFileSync(join(root, "annotations/a1.json"), JSON.stringify({ version: 1, canvas: { width: 100 }, objects: [] }), "utf8");
    expect(() => readAnnotationFile(root, "a1")).toThrow(/annotations\/a1\.json.*canvas\.height/);
    await expect(buildProject(root, { outputDir: join(root, "dist") })).rejects.toThrow(/annotations\/a1\.json/);
  });

  it("names the recipe file on YAML and schema errors", () => {
    const root = createProject();
    writeFileSync(join(root, "captures/bad-yaml.yaml"), "url: [unclosed\n", "utf8");
    expect(() => listRecipeFiles(root)).toThrow(/captures\/bad-yaml\.yaml/);
    rmSync(join(root, "captures/bad-yaml.yaml"));

    writeFileSync(join(root, "captures/bad-schema.yaml"), "url: /\noutput: x\n", "utf8");
    expect(() => listRecipeFiles(root)).toThrow(/captures\/bad-schema\.yaml.*screenshot/);
  });
});

describe("runProjectCapture with a recipe ID", () => {
  it("is not blocked by another broken recipe", async () => {
    const root = createProject();
    writeFileSync(join(root, "page.html"), '<!doctype html><body style="margin:0"><div id="t" style="width:40px;height:20px">x</div></body>', "utf8");
    writeFileSync(join(root, "project.yaml"), `title: t\nbaseUrl: ${pathToFileURL(join(root, "page.html")).href}\n`, "utf8");
    writeFileSync(join(root, "captures/good.yaml"), 'url: page.html\nscreenshot:\n  target: "#t"\noutput: good\n', "utf8");
    writeFileSync(join(root, "captures/broken.yaml"), "url: [unclosed\n", "utf8");

    const results = await runProjectCapture(root, "good");
    expect(results).toEqual([{ recipeId: "good", output: "good" }]);
    await expect(runProjectCapture(root)).rejects.toThrow(/captures\/broken\.yaml/);
    await expect(runProjectCapture(root, "missing")).rejects.toThrow(/レシピが見つかりません/);
  });
});
