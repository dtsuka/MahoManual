import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

export interface ExportPdfOptions {
  outputPath: string;
}

export async function exportPdf(distDir: string, options: ExportPdfOptions): Promise<string> {
  const htmlPath = `${distDir}/manual.html`;
  if (!existsSync(htmlPath)) {
    throw new Error(`manual.html not found in ${distDir}`);
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
    await page.pdf({
      path: options.outputPath,
      format: "A4",
      printBackground: true,
      margin: {
        top: "12mm",
        right: "12mm",
        bottom: "12mm",
        left: "12mm",
      },
    });
  } finally {
    await browser.close();
  }

  return options.outputPath;
}
