import { join } from "node:path";
import { imageSize } from "image-size";
import { describe, expect, it } from "vitest";
import { readAnnotationFile } from "./project.js";
import { renderAnnotationPng } from "./export-image.js";

const fixtureProject = join(import.meta.dirname, "../tests/fixtures/projects/demo");

describe("renderAnnotationPng", () => {
  it("renders the annotation canvas and overlays into a PNG at canvas dimensions", async () => {
    const annotation = readAnnotationFile(fixtureProject, "demo");
    const png = await renderAnnotationPng(fixtureProject, annotation);
    const size = imageSize(png);

    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(size.width).toBe(annotation.canvas.width);
    expect(size.height).toBe(annotation.canvas.height);
    expect(png.byteLength).toBeGreaterThan(1_000);
  });
});
