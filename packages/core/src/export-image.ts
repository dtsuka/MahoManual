import { readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { imageSize } from "image-size";
import { chromium } from "playwright";
import { renderFigure } from "./render.js";
import type { AnnotationFile } from "./schema.js";
import { THEME_FIGURE_CSS } from "./theme.js";

function imageMime(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return "image/png";
  }
}

export async function renderAnnotationPng(
  projectRoot: string,
  annotation: AnnotationFile,
): Promise<Buffer> {
  const images = annotation.objects.filter(
    (obj): obj is Extract<(typeof annotation.objects)[number], { type: "image" }> =>
      obj.type === "image",
  );
  const naturalSizes: Record<string, { w: number; h: number }> = {};
  const dataUrls = new Map<string, string>();
  for (const image of images) {
    if (dataUrls.has(image.src)) {
      continue;
    }
    const bytes = readFileSync(join(projectRoot, image.src));
    const size = imageSize(bytes);
    if (!size.width || !size.height) {
      throw new Error(`画像サイズを取得できません: ${image.src}`);
    }
    naturalSizes[image.src] = { w: size.width, h: size.height };
    dataUrls.set(
      image.src,
      `data:${imageMime(image.src)};base64,${bytes.toString("base64")}`,
    );
  }

  let figure = renderFigure(annotation, {
    naturalSizes,
    fence: { width: annotation.canvas.width },
  });
  for (const [src, dataUrl] of dataUrls) {
    figure = figure.replaceAll(`src="${src}"`, `src="${dataUrl}"`);
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${THEME_FIGURE_CSS}
html,body{margin:0;padding:0;background:transparent;width:${annotation.canvas.width}px;height:${annotation.canvas.height}px;overflow:hidden}
figure.mm{margin:0!important;max-width:none!important;width:${annotation.canvas.width}px!important;height:${annotation.canvas.height}px!important}</style></head><body>${figure}</body></html>`;

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: {
        width: Math.ceil(annotation.canvas.width),
        height: Math.ceil(annotation.canvas.height),
      },
      deviceScaleFactor: 1,
    });
    await page.setContent(html, { waitUntil: "load" });
    await page.waitForFunction(() => [...document.images].every((image) => image.complete));
    return await page.locator("figure").screenshot({
      type: "png",
      omitBackground: true,
    });
  } finally {
    await browser.close();
  }
}
