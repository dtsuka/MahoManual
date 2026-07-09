import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildProject } from "./build.js";
import { exportPdf } from "./pdf.js";

export async function renderManualHtmlDownload(projectRoot: string): Promise<Buffer> {
  const outputDir = mkdtempSync(join(tmpdir(), "mahomanual-html-download-"));
  try {
    const result = await buildProject(projectRoot, { outputDir, singleFile: true });
    return readFileSync(result.htmlPath);
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
}

export async function renderManualPdfDownload(projectRoot: string): Promise<Buffer> {
  const outputDir = mkdtempSync(join(tmpdir(), "mahomanual-pdf-download-"));
  try {
    await buildProject(projectRoot, { outputDir });
    const outputPath = join(outputDir, "manual.pdf");
    await exportPdf(outputDir, { outputPath });
    return readFileSync(outputPath);
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
}
