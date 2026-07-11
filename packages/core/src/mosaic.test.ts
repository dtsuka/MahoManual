import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { applyMosaicsToImage, mosaicRegionsForImage } from "./mosaic.js";
import { parseAnnotation } from "./schema.js";

function mosaicAnnotation() {
  return parseAnnotation({
    version: 1,
    canvas: { width: 8, height: 4 },
    objects: [
      {
        id: "img-main",
        type: "image",
        source: "manual",
        src: "img/raw/a.png",
        rect: { x: 0, y: 0, w: 100, h: 100 },
      },
      {
        id: "m1",
        type: "mosaic",
        source: "manual",
        targetImageId: "img-main",
        rect: { x: 0, y: 0, w: 50, h: 100 },
        blockSize: 2,
      },
    ],
  });
}

describe("mosaicRegionsForImage", () => {
  it("maps canvas percentages through image rect and crop into source pixels", () => {
    const annotation = parseAnnotation({
      version: 1,
      canvas: { width: 100, height: 100 },
      objects: [
        {
          id: "img-main",
          type: "image",
          source: "manual",
          src: "img/raw/a.png",
          rect: { x: 10, y: 20, w: 40, h: 50 },
          crop: { x: 100, y: 200, w: 800, h: 500 },
        },
        {
          id: "m1",
          type: "mosaic",
          source: "manual",
          targetImageId: "img-main",
          rect: { x: 20, y: 30, w: 10, h: 10 },
          blockSize: 5,
        },
      ],
    });
    const image = annotation.objects[0];
    if (!image || image.type !== "image") {
      throw new Error("image fixture missing");
    }
    expect(mosaicRegionsForImage(annotation, image, { w: 1000, h: 1000 })).toEqual([
      { left: 300, top: 300, width: 200, height: 100, columns: 2, rows: 2 },
    ]);
  });
});

describe("applyMosaicsToImage", () => {
  it("pixelates only the selected source region", async () => {
    const width = 8;
    const height = 4;
    const pixels = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 3;
        pixels[offset] = x * 24;
        pixels[offset + 1] = y * 40;
        pixels[offset + 2] = 100;
      }
    }
    const source = await sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();
    const annotation = mosaicAnnotation();
    const image = annotation.objects[0];
    if (!image || image.type !== "image") {
      throw new Error("image fixture missing");
    }
    const output = await applyMosaicsToImage(source, annotation, image);
    const { data } = await sharp(output).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const red = (x: number) => data[x * 3];
    expect(red(0)).toBe(red(1));
    expect(red(2)).toBe(red(3));
    expect(red(4)).not.toBe(red(5));
  });
});
