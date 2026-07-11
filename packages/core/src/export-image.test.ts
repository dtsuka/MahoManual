import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { imageSize } from "image-size";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { readAnnotationFile } from "./project.js";
import { renderAnnotationPng } from "./export-image.js";
import { parseAnnotation } from "./schema.js";

const fixtureProject = join(import.meta.dirname, "../tests/fixtures/projects/demo");

describe("renderAnnotationPng", () => {
  it(
    "renders the annotation canvas and overlays into a PNG at canvas dimensions",
    async () => {
      const annotation = readAnnotationFile(fixtureProject, "demo");
      const png = await renderAnnotationPng(fixtureProject, annotation);
      const size = imageSize(png);

      expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(size.width).toBe(annotation.canvas.width);
      expect(size.height).toBe(annotation.canvas.height);
      expect(png.byteLength).toBeGreaterThan(1_000);
    },
    10_000,
  );

  it(
    "bakes mosaic pixels into the composed PNG",
    async () => {
      const root = mkdtempSync(join(tmpdir(), "mahomanual-export-mosaic-"));
      mkdirSync(join(root, "img"), { recursive: true });
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
      await sharp(pixels, { raw: { width, height, channels: 3 } }).png().toFile(join(root, "img/a.png"));
      const annotation = parseAnnotation({
        version: 1,
        canvas: { width, height },
        objects: [
          { id: "img-main", type: "image", source: "manual", src: "img/a.png", rect: { x: 0, y: 0, w: 100, h: 100 } },
          { id: "m1", type: "mosaic", source: "manual", targetImageId: "img-main", rect: { x: 0, y: 0, w: 50, h: 100 }, blockSize: 2 },
        ],
      });
      try {
        const png = await renderAnnotationPng(root, annotation);
        const { data } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        const red = (x: number) => data[x * 3];
        expect(red(0)).toBe(red(1));
        expect(red(2)).toBe(red(3));
        expect(red(4)).not.toBe(red(5));
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
    10_000,
  );
});
