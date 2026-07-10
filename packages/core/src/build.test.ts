import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { imageSize } from "image-size";
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

  it("writes a physically cropped image for annotated images", async () => {
    const root = createTempProject(
      ["# 実クロップ", "", "```annotated-image", "src: demo", "```", ""].join("\n"),
    );
    writeFileSync(
      join(root, "annotations/demo.json"),
      JSON.stringify({
        version: 1,
        canvas: { width: 100, height: 50 },
        objects: [
          {
            id: "img-main",
            type: "image",
            source: "manual",
            src: "img/demo.png",
            rect: { x: 0, y: 0, w: 100, h: 100 },
            crop: { x: 20, y: 30, w: 100, h: 50 },
          },
        ],
      }),
      "utf8",
    );
    const outDir = mkdtempSync(join(tmpdir(), "mahomanual-cropped-"));
    try {
      const result = await buildProject(root, { outputDir: outDir });
      const html = readFileSync(result.htmlPath, "utf8");
      const croppedPath = join(outDir, "img/cropped/demo/img-main.png");

      expect(html).toContain('src="img/cropped/demo/img-main.png"');
      expect(existsSync(croppedPath)).toBe(true);
      expect(existsSync(join(outDir, "img/demo.png"))).toBe(false);
      expect(imageSize(readFileSync(croppedPath))).toMatchObject({ width: 100, height: 50 });
    } finally {
      rmSync(outDir, { recursive: true, force: true });
      rmSync(root, { recursive: true, force: true });
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

  it("renders GFM pipe tables as HTML tables", async () => {
    const root = createTempProject(
      [
        "# テーブル",
        "",
        "| 操作する人 | 主な操作 |",
        "|---|---|",
        "| 管理者 | 公開 |",
        "| 投稿者 | 編集 |",
        "",
      ].join("\n"),
    );
    const outDir = mkdtempSync(join(tmpdir(), "mahomanual-table-"));
    try {
      const result = await buildProject(root, { outputDir: outDir });
      const html = readFileSync(result.htmlPath, "utf8");
      expect(html).toContain("<table>");
      expect(html).toContain("<th>操作する人</th>");
      expect(html).toContain("<td>管理者</td>");
      expect(html).toContain("<td>公開</td>");
      expect(html).not.toContain("| 操作する人 | 主な操作 |");
    } finally {
      rmSync(outDir, { recursive: true, force: true });
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("expands <!-- toc --> into an H2-only table of contents", async () => {
    const root = createTempProject(
      [
        "# 目次テスト",
        "",
        "導入文",
        "",
        "<!-- toc -->",
        "",
        "## 1 運用ルール",
        "",
        "### 1-1 詳細",
        "",
        "## 2 お知らせの追加（管理者）",
        "",
      ].join("\n"),
    );
    const outDir = mkdtempSync(join(tmpdir(), "mahomanual-toc-"));
    try {
      const result = await buildProject(root, { outputDir: outDir });
      const html = readFileSync(result.htmlPath, "utf8");
      expect(html).toContain('<nav class="mm-toc">');
      expect(html).toContain('href="#1-運用ルール"');
      expect(html).toContain('href="#2-お知らせの追加管理者"');
      expect(html).toContain("1 運用ルール");
      expect(html).toContain("2 お知らせの追加（管理者）");
      const tocHtml = html.match(/<nav class="mm-toc">[\s\S]*?<\/nav>/)?.[0] ?? "";
      expect(tocHtml).not.toContain("1-1 詳細");
      expect(html).not.toContain("<!-- toc -->");
    } finally {
      rmSync(outDir, { recursive: true, force: true });
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("matches TOC href slugs with rehype-slug heading ids", async () => {
    const root = createTempProject(
      [
        "# 目次",
        "",
        "<!-- toc -->",
        "",
        "## 1 運用ルール",
        "",
      ].join("\n"),
    );
    const outDir = mkdtempSync(join(tmpdir(), "mahomanual-toc-slug-"));
    try {
      const result = await buildProject(root, { outputDir: outDir });
      const html = readFileSync(result.htmlPath, "utf8");
      expect(html).toContain('href="#1-運用ルール"');
      expect(html).toContain('id="1-運用ルール"');
    } finally {
      rmSync(outDir, { recursive: true, force: true });
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not emit a table of contents without <!-- toc --> marker", async () => {
    const root = createTempProject(
      [
        "# 目次なし",
        "",
        "## 1 運用ルール",
        "",
      ].join("\n"),
    );
    const outDir = mkdtempSync(join(tmpdir(), "mahomanual-no-toc-"));
    try {
      const result = await buildProject(root, { outputDir: outDir });
      const html = readFileSync(result.htmlPath, "utf8");
      expect(html).not.toContain('<nav class="mm-toc">');
    } finally {
      rmSync(outDir, { recursive: true, force: true });
      rmSync(root, { recursive: true, force: true });
    }
  });
});
