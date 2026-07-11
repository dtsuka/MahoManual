import sharp from "sharp";
import type { AnnotationFile, AnnotationObject } from "./schema.js";

const DEFAULT_BLOCK_SIZE = 12;

type ImageObject = Extract<AnnotationObject, { type: "image" }>;

export interface MosaicPixelRegion {
  left: number;
  top: number;
  width: number;
  height: number;
  columns: number;
  rows: number;
}

export function mosaicRegionsForImage(
  annotation: AnnotationFile,
  image: ImageObject,
  natural: { w: number; h: number },
): MosaicPixelRegion[] {
  const crop = image.crop ?? { x: 0, y: 0, w: natural.w, h: natural.h };
  const regions: MosaicPixelRegion[] = [];
  for (const mosaic of annotation.objects) {
    if (mosaic.type !== "mosaic" || mosaic.targetImageId !== image.id) {
      continue;
    }
    const leftPct = Math.max(image.rect.x, mosaic.rect.x);
    const topPct = Math.max(image.rect.y, mosaic.rect.y);
    const rightPct = Math.min(image.rect.x + image.rect.w, mosaic.rect.x + mosaic.rect.w);
    const bottomPct = Math.min(image.rect.y + image.rect.h, mosaic.rect.y + mosaic.rect.h);
    if (rightPct <= leftPct || bottomPct <= topPct) {
      continue;
    }

    const sourceLeft = Math.max(0, Math.floor(
      crop.x + ((leftPct - image.rect.x) / image.rect.w) * crop.w,
    ));
    const sourceTop = Math.max(0, Math.floor(
      crop.y + ((topPct - image.rect.y) / image.rect.h) * crop.h,
    ));
    const sourceRight = Math.min(natural.w, Math.ceil(
      crop.x + ((rightPct - image.rect.x) / image.rect.w) * crop.w,
    ));
    const sourceBottom = Math.min(natural.h, Math.ceil(
      crop.y + ((bottomPct - image.rect.y) / image.rect.h) * crop.h,
    ));
    const width = sourceRight - sourceLeft;
    const height = sourceBottom - sourceTop;
    if (width < 1 || height < 1) {
      continue;
    }

    const blockSize = mosaic.blockSize ?? DEFAULT_BLOCK_SIZE;
    const canvasWidth = ((rightPct - leftPct) / 100) * annotation.canvas.width;
    const canvasHeight = ((bottomPct - topPct) / 100) * annotation.canvas.height;
    regions.push({
      left: sourceLeft,
      top: sourceTop,
      width,
      height,
      columns: Math.max(1, Math.ceil(canvasWidth / blockSize)),
      rows: Math.max(1, Math.ceil(canvasHeight / blockSize)),
    });
  }
  return regions;
}

export async function applyMosaicsToImage(
  source: Buffer,
  annotation: AnnotationFile,
  image: ImageObject,
): Promise<Buffer> {
  const metadata = await sharp(source).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`画像サイズを取得できません: ${image.src}`);
  }
  const regions = mosaicRegionsForImage(annotation, image, {
    w: metadata.width,
    h: metadata.height,
  });
  if (regions.length === 0) {
    return sharp(source).png().toBuffer();
  }
  const overlays = await Promise.all(regions.map(async (region) => {
    const reduced = await sharp(source)
      .extract({ left: region.left, top: region.top, width: region.width, height: region.height })
      .resize(region.columns, region.rows, { fit: "fill", kernel: sharp.kernel.nearest })
      .png()
      .toBuffer();
    const input = await sharp(reduced)
      .resize(region.width, region.height, { fit: "fill", kernel: sharp.kernel.nearest })
      .png()
      .toBuffer();
    return { input, left: region.left, top: region.top };
  }));
  return sharp(source).composite(overlays).png().toBuffer();
}
