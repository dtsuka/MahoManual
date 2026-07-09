import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { buildProject } from "./build.js";
import { exportPdf } from "./pdf.js";

const EMBEDDED_RASTER_RE = /data:image\/(?:png|jpe?g);base64,[A-Za-z0-9+/=]+/g;
const DEFAULT_WEBP_QUALITY = 0.82;

export async function compressEmbeddedImagesToWebp(
  html: string,
  quality = DEFAULT_WEBP_QUALITY,
): Promise<string> {
  const sources = [...new Set(html.match(EMBEDDED_RASTER_RE) ?? [])];
  if (sources.length === 0) {
    return html;
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const converted = await page.evaluate(
      async ({ imageSources, webpQuality }) => {
        const results: string[] = [];
        for (const source of imageSources) {
          const webp = await new Promise<string>((resolve, reject) => {
            const image = new Image();
            image.onerror = () => reject(new Error("埋め込み画像を読み込めません"));
            image.onload = () => {
              const canvas = document.createElement("canvas");
              canvas.width = image.naturalWidth;
              canvas.height = image.naturalHeight;
              const context = canvas.getContext("2d");
              if (!context) {
                reject(new Error("Canvas 2D contextを作成できません"));
                return;
              }
              context.drawImage(image, 0, 0);
              resolve(canvas.toDataURL("image/webp", webpQuality));
            };
            image.src = source;
          });
          results.push(webp);
        }
        return results;
      },
      { imageSources: sources, webpQuality: quality },
    );
    let compressed = html;
    sources.forEach((source, index) => {
      compressed = compressed.replaceAll(source, converted[index]!);
    });
    return compressed;
  } finally {
    await browser.close();
  }
}

export async function renderManualHtmlDownload(projectRoot: string): Promise<Buffer> {
  const outputDir = mkdtempSync(join(tmpdir(), "mahomanual-html-download-"));
  try {
    const result = await buildProject(projectRoot, { outputDir, singleFile: true });
    const html = readFileSync(result.htmlPath, "utf8");
    return Buffer.from(await compressEmbeddedImagesToWebp(html), "utf8");
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
