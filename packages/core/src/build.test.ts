import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { buildProject } from "./build.js";

const fixtureProject = join(import.meta.dirname, "../tests/fixtures/projects/demo");
const fixtureImage = join(fixtureProject, "img/demo.png");

// demo の画像・注釈を流用した一時プロジェクトを組み立てる
function createTempProject(manualMd: string): string {
  const root = mkdtempSync(join(tmpdir(), "mahomanual-build-tmp-"));
  mkdirSync(join(root, "img"), { recursive: true });
  mkdirSync(join(root, "annotations"), { recursive: true });
  copyFileSync(fixtureImage, join(root, "img/demo.png"));
  copyFileSync(join(fixtureProject, "annotations/demo.json"), join(root, "annotations/demo.json"));
  writeFileSync(join(root, "manual.md"), manualMd, "utf8");
  return root;
}

describe("buildProject", () => {
  it("builds HTML with figure expansion, theme CSS, heading ids, raw HTML, and title", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "mahomanual-build-"));
    try {
      const result = await buildProject(fixtureProject, { outputDir: outDir });
      const html = readFileSync(result.htmlPath, "utf8");

      expect(html).toContain("<!doctype html>");
      expect(html).toContain("<title>テストマニュアル</title>");
      expect(html).toContain(".mm-badge");
      expect(html).toContain('class="mm mm-print-l mm-border"');
      expect(html).toContain("<figcaption>デモキャプション</figcaption>");
      expect(html).toContain('id="1-施設情報カテゴリーの追加"');
      expect(html).toContain('<div class="custom-block">生HTMLブロック</div>');
      expect(html).toContain('class="page-break"');
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("throws when annotated-image src references missing annotation file", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "mahomanual-build-"));
    const badProject = mkdtempSync(join(tmpdir(), "mahomanual-bad-"));
    try {
      writeFileSync(
        join(badProject, "manual.md"),
        "```annotated-image\nsrc: missing-id\n```\n",
      );
      await expect(buildProject(badProject, { outputDir: outDir })).rejects.toThrow(/missing-id/);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
      rmSync(badProject, { recursive: true, force: true });
    }
  });

  it("inlines images as base64 when singleFile is enabled", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "mahomanual-single-"));
    try {
      const result = await buildProject(fixtureProject, { outputDir: outDir, singleFile: true });
      const html = readFileSync(result.htmlPath, "utf8");

      expect(html).not.toContain('src="img/');
      expect(html).toContain("data:image/png;base64,");
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("copies plain markdown/raw-HTML images under img/ to dist", async () => {
    const root = createTempProject(
      [
        "# 画像コピー",
        "",
        '<img width="680" alt="" src="img/demo.png">',
        "",
        "![md画像](img/md-image.png)",
        "",
      ].join("\n"),
    );
    copyFileSync(fixtureImage, join(root, "img/md-image.png"));
    const outDir = mkdtempSync(join(tmpdir(), "mahomanual-plain-"));
    try {
      await buildProject(root, { outputDir: outDir });
      expect(existsSync(join(outDir, "img/demo.png"))).toBe(true);
      expect(existsSync(join(outDir, "img/md-image.png"))).toBe(true);

      const single = await buildProject(root, { outputDir: outDir, singleFile: true });
      const html = readFileSync(single.htmlPath, "utf8");
      expect(html).not.toContain('src="img/');
      expect(html).toContain("data:image/png;base64,");
    } finally {
      rmSync(outDir, { recursive: true, force: true });
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not expand annotated-image examples inside fenced code blocks", async () => {
    const root = createTempProject(
      [
        "# フェンス例",
        "",
        "````md",
        "```annotated-image",
        "src: does-not-exist",
        "```",
        "````",
        "",
      ].join("\n"),
    );
    const outDir = mkdtempSync(join(tmpdir(), "mahomanual-nested-"));
    try {
      const result = await buildProject(root, { outputDir: outDir });
      const html = readFileSync(result.htmlPath, "utf8");
      expect(html).not.toContain("<figure");
      expect(html).toContain("annotated-image");
    } finally {
      rmSync(outDir, { recursive: true, force: true });
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("expands annotated-image fences in CRLF markdown", async () => {
    const root = createTempProject(
      "# CRLF\r\n\r\n```annotated-image\r\nsrc: demo\r\n```\r\n",
    );
    const outDir = mkdtempSync(join(tmpdir(), "mahomanual-crlf-"));
    try {
      const result = await buildProject(root, { outputDir: outDir });
      const html = readFileSync(result.htmlPath, "utf8");
      expect(html).toContain("<figure");
    } finally {
      rmSync(outDir, { recursive: true, force: true });
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("embeds annotation theme overrides from project.yaml", async () => {
    const root = createTempProject(
      ["# テーマ", "", "```annotated-image", "src: demo", "```", ""].join("\n"),
    );
    writeFileSync(
      join(root, "project.yaml"),
      "title: theme test\nannotation:\n  color: \"#112233\"\n  fontSize: 16\n",
      "utf8",
    );
    const outDir = mkdtempSync(join(tmpdir(), "mahomanual-themed-"));
    try {
      const result = await buildProject(root, { outputDir: outDir });
      const html = readFileSync(result.htmlPath, "utf8");
      expect(html).toContain("--mm-color: #112233");
      expect(html).toContain("--mm-font-size: 16px");
    } finally {
      rmSync(outDir, { recursive: true, force: true });
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("derives title from first real heading (not code blocks) and escapes it", async () => {
    const root = createTempProject(
      [
        "```",
        "# コード内コメント",
        "```",
        "",
        "# A & B <x>",
        "",
        "本文",
        "",
      ].join("\n"),
    );
    const outDir = mkdtempSync(join(tmpdir(), "mahomanual-title-"));
    try {
      const result = await buildProject(root, { outputDir: outDir });
      const html = readFileSync(result.htmlPath, "utf8");
      expect(html).toContain("<title>A &amp; B &lt;x&gt;</title>");
    } finally {
      rmSync(outDir, { recursive: true, force: true });
      rmSync(root, { recursive: true, force: true });
    }
  });
});
