import { describe, expect, it } from "vitest";
import type { AnnotationFile, AnnotationObject } from "@mahomanual/core/schema";
import { mergeServerImageChange } from "./annotation-image-merge.js";

const image: AnnotationObject = {
  id: "image-1",
  type: "image",
  source: "manual",
  src: "img/raw/base.png",
  rect: { x: 0, y: 0, w: 100, h: 100 },
  crop: { x: 0, y: 0, w: 1000, h: 500 },
  locked: true,
};

const badge: AnnotationObject = {
  id: "badge-1",
  type: "badge",
  source: "manual",
  n: 1,
  at: { x: 10, y: 10 },
};

function base(): AnnotationFile {
  return {
    version: 1,
    canvas: { width: 1000, height: 500 },
    objects: [structuredClone(image), structuredClone(badge)],
  };
}

describe("mergeServerImageChange", () => {
  it("追加された画像オブジェクトだけを未保存の編集へ合流させる", () => {
    const local: AnnotationFile = {
      ...base(),
      objects: [
        structuredClone(image),
        { ...structuredClone(badge), at: { x: 40, y: 40 } } as AnnotationObject,
        { id: "frame-1", type: "frame", source: "manual", rect: { x: 1, y: 1, w: 5, h: 5 } },
      ],
    };
    const added: AnnotationObject = {
      id: "image-2",
      type: "image",
      source: "manual",
      src: "img/raw/added.png",
      rect: { x: 25, y: 25, w: 50, h: 50 },
    };
    const remote: AnnotationFile = { ...base(), objects: [...base().objects, added] };

    const merged = mergeServerImageChange(base(), local, remote, "image-2");

    expect(merged.objects.map((obj) => obj.id)).toEqual(["image-1", "badge-1", "frame-1", "image-2"]);
    expect(merged.objects[1]).toMatchObject({ at: { x: 40, y: 40 } });
    expect(merged.objects[3]).toEqual(added);
    expect(merged.canvas).toEqual(local.canvas);
  });

  it("置換ではサーバーが変えたフィールドとキャンバスだけを取り込み、手元の配置変更を保つ", () => {
    const local: AnnotationFile = {
      ...base(),
      objects: [
        { ...structuredClone(image), rect: { x: 5, y: 5, w: 90, h: 90 }, locked: false } as AnnotationObject,
        { ...structuredClone(badge), at: { x: 40, y: 40 } } as AnnotationObject,
      ],
    };
    const remote: AnnotationFile = {
      ...base(),
      canvas: { width: 800, height: 600 },
      objects: [
        { ...structuredClone(image), crop: { x: 0, y: 0, w: 800, h: 600 } } as AnnotationObject,
        structuredClone(badge),
      ],
    };

    const merged = mergeServerImageChange(base(), local, remote, "image-1");

    expect(merged.canvas).toEqual({ width: 800, height: 600 });
    expect(merged.objects[0]).toEqual({
      ...image,
      rect: { x: 5, y: 5, w: 90, h: 90 },
      locked: false,
      crop: { x: 0, y: 0, w: 800, h: 600 },
    });
    expect(merged.objects[1]).toMatchObject({ at: { x: 40, y: 40 } });
  });

  it("サーバー側に対象が無ければ手元をそのまま返す", () => {
    const local = base();
    expect(mergeServerImageChange(base(), local, base(), "missing")).toBe(local);
  });
});
