import { existsSync, statSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { buildProject } from "./build.js";
import { exportPdf } from "./pdf.js";

const fixtureProject = join(import.meta.dirname, "../tests/fixtures/projects/demo");

describe("exportPdf", () => {
  it("generates dist/manual.pdf larger than 1KB from fixture project", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "mahomanual-pdf-"));
    try {
      await buildProject(fixtureProject, { outputDir: outDir });
      const pdfPath = await exportPdf(outDir, { outputPath: join(outDir, "manual.pdf") });

      expect(existsSync(pdfPath)).toBe(true);
      expect(statSync(pdfPath).size).toBeGreaterThan(1024);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 30000);
});
