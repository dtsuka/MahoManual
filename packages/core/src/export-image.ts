import { readFileSync } from "node:fs";
import { join } from "node:path";
import { imageSize } from "image-size";
import { chromium } from "playwright";
import { renderFigure } from "./render.js";
import type { AnnotationFile } from "./schema.js";
import { THEME_FIGURE_CSS, THEME_FONT_LINKS_HTML } from "./theme.js";
import { applyMosaicsToImage } from "./mosaic.js";

export async function renderAnnotationPng(
  projectRoot: string,
  annotation: AnnotationFile,
): Promise<Buffer> {
  const images = annotation.objects.filter(
    (obj): obj is Extract<(typeof annotation.objects)[number], { type: "image" }> =>
      obj.type === "image",
  );
  const naturalSizes: Record<string, { w: number; h: number }> = {};
  const imageSources: Record<string, string> = {};
  for (const image of images) {
    const bytes = readFileSync(join(projectRoot, image.src));
    const size = imageSize(bytes);
    if (!size.width || !size.height) {
      throw new Error(`画像サイズを取得できません: ${image.src}`);
    }
    naturalSizes[image.src] = { w: size.width, h: size.height };
    const mosaicked = await applyMosaicsToImage(bytes, annotation, image);
    imageSources[image.id] = `data:image/png;base64,${mosaicked.toString("base64")}`;
  }

  const safeAnnotation: AnnotationFile = {
    ...annotation,
    objects: annotation.objects.filter((obj) => obj.type !== "mosaic"),
  };
  const figure = renderFigure(safeAnnotation, {
    naturalSizes,
    imageSources,
    fence: { width: annotation.canvas.width },
  });
  const html = `<!doctype html><html><head><meta charset="utf-8">${THEME_FONT_LINKS_HTML}<style>${THEME_FIGURE_CSS}
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
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.waitForFunction(() => [...document.images].every((image) => image.complete));
    await page.evaluate(() => document.fonts.ready);
    return await page.locator("figure").screenshot({
      type: "png",
      omitBackground: true,
    });
  } finally {
    await browser.close();
  }
}
