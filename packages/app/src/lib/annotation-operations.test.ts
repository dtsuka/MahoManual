import { describe, expect, it } from "vitest";
import type { AnnotationObject } from "@mahomanual/core/schema";
import {
  clampCrop,
  duplicateObjects,
  removeUnlockedObjects,
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
  {
    id: "cursor-1",
    type: "cursor",
    source: "manual",
    icon: "pointer",
    at: { x: 40, y: 50 },
  },
  {
    id: "mosaic-1",
    type: "mosaic",
    source: "manual",
    targetImageId: "img-main",
    rect: { x: 12, y: 14, w: 20, h: 10 },
    blockSize: 8,
  },
];

describe("translateObjects", () => {
  it("選択した型の異なるオブジェクトを同じ量だけ移動する", () => {
    const translated = translateObjects(
      objects,
      new Set(["badge-1", "frame-1", "line-1", "cursor-1", "mosaic-1"]),
      2,
      -3,
    );
    expect(translated[0]).toMatchObject({ at: { x: 12, y: 17 } });
    expect(translated[1]).toMatchObject({ rect: { x: 32, y: 37, w: 20, h: 10 } });
    expect(translated[2]).toMatchObject({
      points: [{ x: 7, y: 3 }, { x: 17, y: 13 }],
    });
    expect(translated[3]).toMatchObject({ at: { x: 42, y: 47 } });
    expect(translated[4]).toMatchObject({ rect: { x: 14, y: 11, w: 20, h: 10 } });
  });

  it("ロック中のオブジェクトは選択されていても移動しない", () => {
    const locked = objects.map((obj) => obj.id === "frame-1" ? { ...obj, locked: true } : obj);
    const translated = translateObjects(locked, new Set(["badge-1", "frame-1"]), 2, -3);
    expect(translated[0]).toMatchObject({ at: { x: 12, y: 17 } });
    expect(translated[1]).toEqual(locked[1]);
  });
});

describe("removeUnlockedObjects", () => {
  it("選択中でもロックされたオブジェクトは削除しない", () => {
    const locked = objects.map((obj) => obj.id === "frame-1" ? { ...obj, locked: true } : obj);
    const result = removeUnlockedObjects(locked, new Set(["badge-1", "frame-1"]));
    expect(result.map((obj) => obj.id)).toEqual(["frame-1", "line-1", "cursor-1", "mosaic-1"]);
  });
});

describe("duplicateObjects", () => {
  it("選択オブジェクトを前面へ複製し、一意IDとオフセットを付ける", () => {
    const duplicated = duplicateObjects(objects, ["badge-1", "line-1"], 1);
    expect(duplicated.objects).toHaveLength(7);
    expect(duplicated.selectedIds).toHaveLength(2);
    expect(new Set(duplicated.objects.map((obj) => obj.id)).size).toBe(7);
    expect(duplicated.objects[5]).toMatchObject({ type: "badge", at: { x: 11, y: 21 } });
    expect(duplicated.objects[6]).toMatchObject({
      type: "line",
      points: [{ x: 6, y: 7 }, { x: 16, y: 17 }],
    });
  });

  it("ロック中のオブジェクトは複製しない", () => {
    const locked = objects.map((obj) => obj.id === "frame-1" ? { ...obj, locked: true } : obj);
    const duplicated = duplicateObjects(locked, ["badge-1", "frame-1"], 1);
    expect(duplicated.objects).toHaveLength(6);
    expect(duplicated.selectedIds).toHaveLength(1);
    expect(duplicated.objects.filter((obj) => obj.type === "badge")).toHaveLength(2);
    expect(duplicated.objects.some((obj) => obj.id === "frame-1")).toBe(true);
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
