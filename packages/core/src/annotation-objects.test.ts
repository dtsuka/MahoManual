import { describe, expect, it } from "vitest";
import type { AnnotationObject } from "./schema.js";
import {
  applyDefaultImageLocks,
  collectImageSources,
  editableRect,
  hasEditableRect,
  isAddedImage,
  isBaseImage,
  mosaicsForImage,
  setTextBoxRect,
  taggableObjectsInDisplayOrder,
  textBoxRect,
  withEditableRect,
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

describe("isAddedImage", () => {
  it("detects images added via addPastedImageObject naming", () => {
    expect(isAddedImage({
      id: "img2",
      type: "image",
      source: "manual",
      src: "img/raw/1-1-img2.png",
      rect: { x: 0, y: 0, w: 10, h: 10 },
    }, "1-1")).toBe(true);
    expect(isAddedImage({
      id: "img-extra",
      type: "image",
      source: "manual",
      src: "img/raw/test-1-img-extra.png",
      rect: { x: 0, y: 0, w: 10, h: 10 },
    }, "test-1")).toBe(true);
    expect(isAddedImage({
      id: "img-main",
      type: "image",
      source: "manual",
      src: "img/raw/1-1.png",
      rect: { x: 0, y: 0, w: 100, h: 100 },
    }, "1-1")).toBe(false);
  });

  it("does not treat composite layout filenames as added images", () => {
    expect(isAddedImage({
      id: "img-left",
      type: "image",
      source: "manual",
      src: "img/raw/1-2-column-left.png",
      rect: { x: 0, y: 0, w: 50, h: 100 },
    }, "1-2")).toBe(false);
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

  it("locks composite layout images that only share an annotation id prefix", () => {
    const result = applyDefaultImageLocks({
      version: 1,
      canvas: { width: 800, height: 600 },
      objects: [
        {
          id: "img-left",
          type: "image",
          source: "manual",
          src: "img/raw/1-2-column-left.png",
          rect: { x: 0, y: 0, w: 50, h: 100 },
        },
      ],
    }, "1-2");

    expect(result.objects[0]).toMatchObject({ id: "img-left", locked: true });
  });
});

describe("editableRect / withEditableRect", () => {
  it("treats text and frame/image/mosaic as editable rectangles", () => {
    const text = {
      id: "t1",
      type: "text" as const,
      source: "manual" as const,
      content: "a",
      at: { x: 10, y: 20 },
      rect: { x: 0, y: 10, w: 20, h: 20 },
    };
    const frame = {
      id: "f1",
      type: "frame" as const,
      source: "manual" as const,
      rect: { x: 1, y: 2, w: 3, h: 4 },
    };
    expect(hasEditableRect(text)).toBe(true);
    expect(hasEditableRect(frame)).toBe(true);
    expect(hasEditableRect(objects[0]!)).toBe(false);
    expect(editableRect(text)).toEqual(text.rect);
    expect(editableRect(frame)).toEqual(frame.rect);
  });

  it("updates text at when writing a new rect", () => {
    const text = {
      id: "t1",
      type: "text" as const,
      source: "manual" as const,
      content: "a",
      at: { x: 10, y: 20 },
      rect: { x: 0, y: 10, w: 20, h: 20 },
    };
    const next = withEditableRect(text, { x: 5, y: 15, w: 30, h: 10 });
    expect(next).toEqual(setTextBoxRect(text, { x: 5, y: 15, w: 30, h: 10 }));
    expect(textBoxRect(next as typeof text)).toEqual({ x: 5, y: 15, w: 30, h: 10 });
  });
});
