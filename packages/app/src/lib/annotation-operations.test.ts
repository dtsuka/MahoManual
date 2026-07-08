import { describe, expect, it } from "vitest";
import type { AnnotationObject } from "@mahomanual/core/schema";
import {
  clampCrop,
  duplicateObjects,
  translateObjects,
} from "./annotation-operations.js";

const objects: AnnotationObject[] = [
  { id: "badge-1", type: "badge", source: "manual", n: 1, at: { x: 10, y: 20 } },
  { id: "frame-1", type: "frame", source: "manual", rect: { x: 30, y: 40, w: 20, h: 10 } },
  {
    id: "line-1",
    type: "line",
    source: "manual",
    points: [{ x: 5, y: 6 }, { x: 15, y: 16 }],
  },
];

describe("translateObjects", () => {
  it("選択した型の異なるオブジェクトを同じ量だけ移動する", () => {
    const translated = translateObjects(objects, new Set(["badge-1", "frame-1", "line-1"]), 2, -3);
    expect(translated[0]).toMatchObject({ at: { x: 12, y: 17 } });
    expect(translated[1]).toMatchObject({ rect: { x: 32, y: 37, w: 20, h: 10 } });
    expect(translated[2]).toMatchObject({
      points: [{ x: 7, y: 3 }, { x: 17, y: 13 }],
    });
  });
});

describe("duplicateObjects", () => {
  it("選択オブジェクトを前面へ複製し、一意IDとオフセットを付ける", () => {
    const duplicated = duplicateObjects(objects, ["badge-1", "line-1"], 1);
    expect(duplicated.objects).toHaveLength(5);
    expect(duplicated.selectedIds).toHaveLength(2);
    expect(new Set(duplicated.objects.map((obj) => obj.id)).size).toBe(5);
    expect(duplicated.objects[3]).toMatchObject({ type: "badge", at: { x: 11, y: 21 } });
    expect(duplicated.objects[4]).toMatchObject({
      type: "line",
      points: [{ x: 6, y: 7 }, { x: 16, y: 17 }],
    });
  });
});

describe("clampCrop", () => {
  it("cropを画像の実ピクセル範囲内かつ1px以上に制約する", () => {
    expect(clampCrop({ x: -10, y: 90, w: 200, h: 0 }, { w: 100, h: 100 })).toEqual({
      x: 0,
      y: 90,
      w: 100,
      h: 1,
    });
  });
});
