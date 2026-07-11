import { describe, expect, it } from "vitest";
import type { AnnotationObject } from "./schema.js";
import {
  collectImageSources,
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
