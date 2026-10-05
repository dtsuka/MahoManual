import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildPreviewHtml, buildProject } from "./build.js";

const fixtureImage = join(import.meta.dirname, "../tests/fixtures/projects/demo/img/demo.png");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function createProject(manual: string): { root: string; outDir: string } {
  const base = mkdtempSync(join(tmpdir(), "mahomanual-build-img-"));
  roots.push(base);
  const root = join(base, "proj");
  mkdirSync(join(root, "img"), { recursive: true });
  copyFileSync(fixtureImage, join(root, "img/demo.png"));
  writeFileSync(join(root, "manual.md"), manual, "utf8");
  return { root, outDir: join(base, "out") };
}

const codeBlockManual = [
  "# T",
  "",
  "CMSに次のHTMLを貼り付けます:",
  "",
  "```html",
  '<img src="img/banner.png">',
  "```",
  "",
  'インラインコード `<img src="img/inline.png">` も文字列です。',
  "",
  "![画面](img/demo.png)",
  "",
].join("\n");

describe("buildProject: images are collected from <img> elements only", () => {
  it("does not treat <img> text inside code as an image", async () => {
    const { root, outDir } = createProject(codeBlockManual);

    const result = await buildProject(root, { outputDir: outDir });
    const html = readFileSync(result.htmlPath, "utf8");
    expect(existsSync(join(outDir, "img/demo.png"))).toBe(true);
    expect(html).toContain("img/banner.png");
    expect(html).toContain("img/inline.png");

    const single = await buildProject(root, { outputDir: outDir, singleFile: true });
    const singleHtml = readFileSync(single.htmlPath, "utf8");
    expect(singleHtml).toContain("data:image/png;base64,");
    // コード内の文字列は書き換えない
    expect(singleHtml).toContain("img/banner.png");
    expect(singleHtml).toContain("img/inline.png");
  });

  it("rewrites only real image elements in the preview", async () => {
    const { root } = createProject("# T\n");
    const html = await buildPreviewHtml(root, codeBlockManual, {
      rewriteImageSrc: (src) => `/files/${src}`,
    });
    expect(html).toContain('src="/files/img/demo.png"');
    expect(html).not.toContain("/files/img/banner.png");
    expect(html).not.toContain("/files/img/inline.png");
  });

  it("normalizes image paths inside the project", async () => {
    const { root, outDir } = createProject("# T\n\n![a](img/sub/../demo.png)\n\n<img src=\"./img/demo.png\" alt=\"b\">\n");

    const result = await buildProject(root, { outputDir: outDir });
    const html = readFileSync(result.htmlPath, "utf8");
    expect(existsSync(join(outDir, "img/demo.png"))).toBe(true);
    expect(html).not.toContain("img/sub/../demo.png");
    expect(html).not.toContain("./img/demo.png");
    expect(html.match(/src="img\/demo\.png"/g)).toHaveLength(2);
  });

  it("copies images whose file names are not ASCII", async () => {
    const { root, outDir } = createProject("# T\n\n![画面](img/画面.png)\n");
    copyFileSync(fixtureImage, join(root, "img/画面.png"));

    await buildProject(root, { outputDir: outDir });
    expect(existsSync(join(outDir, "img/画面.png"))).toBe(true);
  });

  it("uses image/svg+xml for SVG images in single-file output", async () => {
    const { root, outDir } = createProject("# T\n\n![logo](img/logo.svg)\n");
    writeFileSync(join(root, "img/logo.svg"), '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');

    const result = await buildProject(root, { outputDir: outDir, singleFile: true });
    const html = readFileSync(result.htmlPath, "utf8");
    expect(html).toContain('src="data:image/svg+xml;base64,');
    expect(html).not.toContain("data:image/svg;");
  });
});
