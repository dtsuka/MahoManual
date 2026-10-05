import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildPreviewHtml, buildProject } from "./build.js";
import { renderAnnotationPng } from "./export-image.js";
import {
  addAnnotationObject,
  addPastedImageObject,
  createAnnotationSkeleton,
  createManualProject,
  readAnnotationFile,
  renameAnnotationId,
  runProjectCapture,
  savePastedImage,
  writeAnnotationFile,
} from "./project.js";
import { renderFigure } from "./render.js";
import { parseAnnotation, parseRecipe, type AnnotationFile } from "./schema.js";

const fixtureProject = join(import.meta.dirname, "../tests/fixtures/projects/demo");
const fixtureImage = join(fixtureProject, "img/demo.png");

const tempDirs: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

// base/
//   src/project/  プロジェクト(demo の画像・注釈を流用)
//   src/secret.png プロジェクトの外に置いたファイル
//   dist/out/     出力フォルダ
function createSandbox(manualMd: string): { base: string; root: string; outDir: string } {
  const base = tempDir("mahomanual-path-safety-");
  const root = join(base, "src", "project");
  const outDir = join(base, "dist", "out");
  mkdirSync(join(root, "img"), { recursive: true });
  mkdirSync(join(root, "annotations"), { recursive: true });
  copyFileSync(fixtureImage, join(root, "img/demo.png"));
  copyFileSync(join(fixtureProject, "annotations/demo.json"), join(root, "annotations/demo.json"));
  copyFileSync(fixtureImage, join(base, "src", "secret.png"));
  writeFileSync(join(root, "manual.md"), manualMd, "utf8");
  return { base, root, outDir };
}

function annotationWith(objects: unknown[]): unknown {
  return { version: 1, canvas: { width: 100, height: 100 }, objects };
}

function imageObject(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "img-main",
    type: "image",
    source: "manual",
    src: "img/demo.png",
    rect: { x: 0, y: 0, w: 100, h: 100 },
    ...overrides,
  };
}

function badgeObject(id: string): Record<string, unknown> {
  return { id, type: "badge", source: "manual", n: 1, at: { x: 10, y: 10 } };
}

const fence = (src: string) => `# T\n\n\`\`\`annotated-image\nsrc: ${JSON.stringify(src)}\n\`\`\`\n`;

describe("annotation schema: object id", () => {
  it("accepts IDs made of Japanese, letters, digits, hyphen and underscore", () => {
    for (const id of ["b1", "badge-1", "img-main", "1-1-r0", "1-1-image", "注釈_1"]) {
      expect(() => parseAnnotation(annotationWith([badgeObject(id)])), id).not.toThrow();
    }
  });

  it("rejects IDs with path separators, dots, quotes, angle brackets or whitespace", () => {
    for (const id of ["../evil", "a/b", "a\\b", "..", 'x" onload="alert(1)', "<svg>", "a b", "a'b"]) {
      expect(() => parseAnnotation(annotationWith([badgeObject(id)])), id).toThrow();
    }
  });
});

describe("annotation schema: image src", () => {
  it("accepts project-relative paths", () => {
    expect(() => parseAnnotation(annotationWith([imageObject({ src: "img/raw/1-1.png" })]))).not.toThrow();
  });

  it("rejects absolute paths, parent segments and backslashes", () => {
    for (const src of [
      "/etc/passwd",
      "C:/secret.png",
      "../secret.png",
      "img/../../secret.png",
      "img\\demo.png",
      ".auth/state.json",
    ]) {
      expect(() => parseAnnotation(annotationWith([imageObject({ src })])), src).toThrow();
    }
  });
});

describe("recipe schema: output", () => {
  it("rejects an output ID that is not a safe name", () => {
    const yaml = (output: string) =>
      `url: https://example.com\nscreenshot:\n  target: fullPage\noutput: ${JSON.stringify(output)}\n`;
    expect(() => parseRecipe(yaml("1-1"))).not.toThrow();
    expect(() => parseRecipe(yaml("../evil"))).toThrow();
    expect(() => parseRecipe(yaml("a/b"))).toThrow();
  });
});

describe("project path functions reject unsafe IDs", () => {
  it("createManualProject rejects unsafe project IDs and accepts Japanese", () => {
    const projectsRoot = tempDir("mahomanual-projects-");
    for (const name of ["../evil", "a/b", "a b", "<x>", 'a"b', ".."]) {
      expect(() => createManualProject(projectsRoot, name), name).toThrow(/プロジェクトID/);
    }
    expect(readdirSync(projectsRoot)).toEqual([]);
    expect(() => createManualProject(projectsRoot, "新規マニュアル")).not.toThrow();
  });

  it("readAnnotationFile / writeAnnotationFile reject annotation IDs that leave the folder", () => {
    const { base, root } = createSandbox("# T\n");
    const annotation = readAnnotationFile(root, "demo");
    writeFileSync(join(base, "src", "outside.json"), JSON.stringify(annotation), "utf8");

    expect(() => readAnnotationFile(root, "../../outside")).toThrow(/注釈ID/);
    expect(() => writeAnnotationFile(root, "../evil", annotation)).toThrow(/注釈ID/);
    expect(existsSync(join(root, "evil.json"))).toBe(false);
    expect(() => createAnnotationSkeleton(root, "../evil", "img/demo.png", { width: 10, height: 10 })).toThrow(
      /注釈ID/,
    );
    expect(existsSync(join(root, "evil.json"))).toBe(false);
  });

  it("renameAnnotationId rejects an unsafe new ID without touching files", () => {
    const { root } = createSandbox("# T\n");
    expect(() => renameAnnotationId(root, "demo", "../renamed")).toThrow(/注釈ID/);
    expect(existsSync(join(root, "annotations/demo.json"))).toBe(true);
    expect(existsSync(join(root, "renamed.json"))).toBe(false);
  });

  it("addAnnotationObject rejects an unsafe object ID", () => {
    const { root } = createSandbox("# T\n");
    expect(() =>
      addAnnotationObject(root, "demo", badgeObject("../x") as never),
    ).toThrow();
    expect(readAnnotationFile(root, "demo").objects.map((obj) => obj.id)).toEqual(["img-main", "b1"]);
  });

  it("savePastedImage and addPastedImageObject write nothing for unsafe IDs", () => {
    const { base, root } = createSandbox("# T\n");
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    expect(() => savePastedImage(root, "../../pasted", png, { width: 10, height: 10 })).toThrow(/注釈ID/);
    expect(existsSync(join(base, "src", "pasted.png"))).toBe(false);
    expect(existsSync(join(root, "pasted.png"))).toBe(false);

    expect(() =>
      addPastedImageObject(root, "demo", "../../../pasted", png, { width: 10, height: 10 }),
    ).toThrow();
    expect(readdirSync(join(root, "img"))).toEqual(["demo.png"]);
    expect(readdirSync(join(base, "src")).sort()).toEqual(["project", "secret.png"]);
  });

  it("runProjectCapture rejects an unsafe recipe ID", async () => {
    const { root } = createSandbox("# T\n");
    await expect(runProjectCapture(root, "../evil")).rejects.toThrow(/レシピID/);
  });
});

describe("buildProject keeps reads and writes inside the project and output folders", () => {
  it("rejects an annotated-image fence whose src is not a safe annotation ID", async () => {
    for (const src of ["../outside", "a/b", '"><script>alert(1)</script>']) {
      const { root, outDir } = createSandbox(fence(src));
      await expect(buildProject(root, { outputDir: outDir }), src).rejects.toThrow(/注釈ID/);
    }
  });

  it("rejects an annotation whose image src points outside the project", async () => {
    const { root, outDir } = createSandbox(fence("demo"));
    writeFileSync(
      join(root, "annotations/demo.json"),
      JSON.stringify(annotationWith([imageObject({ src: "../secret.png" })])),
      "utf8",
    );
    await expect(buildProject(root, { outputDir: outDir })).rejects.toThrow();
  });

  it("does not copy a raw HTML image that points outside the project", async () => {
    const { base, root, outDir } = createSandbox(
      `# T\n\n<img src="img/../../secret.png" alt="x">\n\n![md](img/../../secret.png)\n`,
    );
    await expect(buildProject(root, { outputDir: outDir })).rejects.toThrow();
    // 検査が無いと dist/out/img/../../secret.png = dist/secret.png へコピーされる
    expect(existsSync(join(base, "dist", "secret.png"))).toBe(false);
  });

  it("does not write cropped images outside the output folder for unsafe object IDs", async () => {
    const { base, root, outDir } = createSandbox(fence("demo"));
    const raw = JSON.stringify(annotationWith([imageObject({ id: "../../../../escaped" })]));
    writeFileSync(join(root, "annotations/demo.json"), raw, "utf8");
    await expect(buildProject(root, { outputDir: outDir })).rejects.toThrow();
    // 検査が無いと dist/out/img/cropped/demo/../../../../escaped.png = dist/escaped.png へ書かれる
    expect(existsSync(join(base, "dist", "escaped.png"))).toBe(false);
  });

  it("buildPreviewHtml rejects an unsafe annotation ID in the fence", async () => {
    const { root } = createSandbox("# T\n");
    await expect(buildPreviewHtml(root, fence('demo" onmouseover="alert(1)'))).rejects.toThrow(/注釈ID/);
  });

  it("buildPreviewHtml writes data-mm-annotation with a safe ID", async () => {
    const { root } = createSandbox("# T\n");
    const html = await buildPreviewHtml(root, fence("demo"));
    expect(html).toContain('data-mm-annotation="demo"');
  });
});

describe("renderFigure escapes object IDs in attributes", () => {
  it("escapes arrow marker IDs even when the annotation was not validated", () => {
    const annotation = {
      version: 1,
      canvas: { width: 100, height: 100 },
      objects: [
        {
          id: 'a"><script>alert(1)</script>',
          type: "arrow",
          source: "manual",
          points: [
            { x: 0, y: 0 },
            { x: 100, y: 100 },
          ],
          arrowHeads: "both",
        },
      ],
    } as unknown as AnnotationFile;
    const html = renderFigure(annotation, { naturalSizes: {} });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('a"><');
  });
});

describe("renderAnnotationPng", () => {
  it("rejects an image src outside the project before reading it", async () => {
    const { root } = createSandbox("# T\n");
    const annotation = {
      version: 1,
      canvas: { width: 100, height: 100 },
      objects: [imageObject({ src: "../secret.png" })],
    } as unknown as AnnotationFile;
    await expect(renderAnnotationPng(root, annotation)).rejects.toThrow(/画像/);
  });
});
