import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { buildProject } from "./build.js";

const fixtureProject = join(import.meta.dirname, "../tests/fixtures/projects/demo");

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
});
