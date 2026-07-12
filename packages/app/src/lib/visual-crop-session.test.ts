import { describe, expect, it } from "vitest";
import type { AnnotationFile } from "@mahomanual/core/schema";
import {
  applyCropCommit,
  tryBeginVisualCrop,
  withFullImageCrop,
} from "./visual-crop-session.js";

function sampleAnnotation(): AnnotationFile {
  return {
    version: 1,
    canvas: { width: 1280, height: 960 },
    objects: [
      {
        id: "img-main",
        type: "image",
        source: "manual",
        src: "img/raw/1-1.png",
        rect: { x: 0, y: 12.5, w: 100, h: 75 },
        crop: { x: 0, y: 240, w: 2560, h: 1440 },
        locked: false,
      },
      {
        id: "badge-1",
        type: "badge",
        source: "manual",
        n: 1,
        at: { x: 10, y: 10 },
      },
    ],
  };
}

const naturalSizes = {
  "img/raw/1-1.png": { w: 2560, h: 1920 },
};

describe("tryBeginVisualCrop", () => {
  it("stagingはフルcrop+reveal rect、sessionは開始時cropを保持する", () => {
    const annotation = sampleAnnotation();
    const begun = tryBeginVisualCrop(annotation, "img-main", naturalSizes);
    expect(begun).not.toBeNull();
    if (!begun) {
      return;
    }
    const staged = begun.staging.objects.find((obj) => obj.id === "img-main");
    expect(staged?.type).toBe("image");
    if (staged?.type !== "image") {
      return;
    }
    expect(staged.crop).toEqual({ x: 0, y: 0, w: 2560, h: 1920 });
    expect(begun.session.crop).toEqual({ x: 0, y: 240, w: 2560, h: 1440 });
    expect(begun.session.natural).toEqual(naturalSizes["img/raw/1-1.png"]);
    expect(begun.session.start).toEqual(annotation);
  });

  it("ロック中や natural 未解決なら null", () => {
    const locked = sampleAnnotation();
    const image = locked.objects[0];
    if (image?.type === "image") {
      image.locked = true;
    }
    expect(tryBeginVisualCrop(locked, "img-main", naturalSizes)).toBeNull();
    expect(tryBeginVisualCrop(sampleAnnotation(), "img-main", {})).toBeNull();
  });
});

describe("applyCropCommit", () => {
  it("sessionのcropとreveal窓から最終rectを書き戻す", () => {
    const annotation = sampleAnnotation();
    const begun = tryBeginVisualCrop(annotation, "img-main", naturalSizes);
    expect(begun).not.toBeNull();
    if (!begun) {
      return;
    }
    const nextCrop = { x: 100, y: 300, w: 2000, h: 1200 };
    const committed = applyCropCommit(begun.staging, {
      ...begun.session,
      crop: nextCrop,
    });
    const image = committed.objects.find((obj) => obj.id === "img-main");
    expect(image?.type).toBe("image");
    if (image?.type !== "image") {
      return;
    }
    expect(image.crop).toEqual(nextCrop);
    expect(image.rect.w).toBeCloseTo(
      (nextCrop.w / begun.session.natural.w) * begun.session.revealRect.w,
      5,
    );
  });
});

describe("withFullImageCrop", () => {
  it("sessionのcropをnatural全体へ戻す", () => {
    const annotation = sampleAnnotation();
    const begun = tryBeginVisualCrop(annotation, "img-main", naturalSizes);
    expect(begun).not.toBeNull();
    if (!begun) {
      return;
    }
    expect(withFullImageCrop(begun.session).crop).toEqual({
      x: 0,
      y: 0,
      w: 2560,
      h: 1920,
    });
  });
});
