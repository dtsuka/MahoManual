import { describe, expect, it } from "vitest";
import type { AnnotationObject } from "./schema.js";
import {
  applyDefaultImageLocks,
  collectImageSources,
  isAddedImageSrc,
  isBaseImage,
  mosaicsForImage,
  taggableObjectsInDisplayOrder,
} from "./annotation-objects.js";

const objects: AnnotationObject[] = [
  { id: "b1", type: "badge", source: "manual", n: 1, at: { x: 0, y: 0 } },
  { id: "img-a", type: "image", source: "manual", src: "img/a.png", rect: { x: 0, y: 0, w: 100, h: 100 } },
  { id: "m1", type: "mosaic", source: "manual", targetImageId: "img-a", rect: { x: 1, y: 2, w: 3, h: 4 } },
  { id: "img-b", type: "image", source: "manual", src: "img/b.png", rect: { x: 10, y: 10, w: 20, h: 20 } },
  { id: "m2", type: "mosaic", source: "manual", targetImageId: "img-b", rect: { x: 5, y: 6, w: 7, h: 8 } },
  { id: "l1", type: "line", source: "manual", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
];

describe("collectImageSources", () => {
  it("returns image src paths in object order", () => {
    expect(collectImageSources({ objects })).toEqual(["img/a.png", "img/b.png"]);
  });
});

describe("mosaicsForImage", () => {
  it("returns mosaics targeting the given image id", () => {
    expect(mosaicsForImage(objects, "img-a").map((obj) => obj.id)).toEqual(["m1"]);
    expect(mosaicsForImage(objects, "img-b").map((obj) => obj.id)).toEqual(["m2"]);
  });
});

describe("taggableObjectsInDisplayOrder", () => {
  it("skips lines and inserts mosaics after their target image", () => {
    expect(taggableObjectsInDisplayOrder(objects).map((obj) => obj.id)).toEqual([
      "b1",
      "img-a",
      "m1",
      "img-b",
      "m2",
    ]);
  });
});

describe("isAddedImageSrc", () => {
  it("detects images added via addPastedImageObject naming", () => {
    expect(isAddedImageSrc("img/raw/1-1-img2.png", "1-1")).toBe(true);
    expect(isAddedImageSrc("img/raw/test-1-img-extra.png", "test-1")).toBe(true);
    expect(isAddedImageSrc("img/raw/1-1.png", "1-1")).toBe(false);
    expect(isAddedImageSrc("img/raw/tall-page.png", "two-column")).toBe(false);
  });
});

describe("isBaseImage", () => {
  it("treats recipe images, img-main, and non-added manual images as base", () => {
    expect(isBaseImage({
      id: "cap-image",
      type: "image",
      source: "recipe",
      src: "img/raw/cap.png",
      rect: { x: 0, y: 0, w: 100, h: 100 },
    }, "cap")).toBe(true);
    expect(isBaseImage({
      id: "img-main",
      type: "image",
      source: "manual",
      src: "img/raw/foo.png",
      rect: { x: 0, y: 0, w: 100, h: 100 },
    }, "foo")).toBe(true);
    expect(isBaseImage({
      id: "img-extra",
      type: "image",
      source: "manual",
      src: "img/raw/1-1-img-extra.png",
      rect: { x: 10, y: 10, w: 20, h: 20 },
    }, "1-1")).toBe(false);
  });
});

describe("applyDefaultImageLocks", () => {
  it("locks base images and unlocks added images when locked is omitted", () => {
    const result = applyDefaultImageLocks({
      version: 1,
      canvas: { width: 800, height: 600 },
      objects: [
        {
          id: "img-main",
          type: "image",
          source: "manual",
          src: "img/raw/1-1.png",
          rect: { x: 0, y: 0, w: 100, h: 100 },
        },
        {
          id: "img2",
          type: "image",
          source: "manual",
          src: "img/raw/1-1-img2.png",
          rect: { x: 10, y: 10, w: 20, h: 20 },
        },
      ],
    }, "1-1");

    expect(result.objects[0]).toMatchObject({ id: "img-main", locked: true });
    expect(result.objects[1]).toMatchObject({ id: "img2", locked: false });
  });

  it("preserves explicit locked values", () => {
    const result = applyDefaultImageLocks({
      version: 1,
      canvas: { width: 800, height: 600 },
      objects: [
        {
          id: "img-main",
          type: "image",
          source: "manual",
          locked: false,
          src: "img/raw/1-1.png",
          rect: { x: 0, y: 0, w: 100, h: 100 },
        },
      ],
    }, "1-1");

    expect(result.objects[0]).toMatchObject({ locked: false });
  });
});
