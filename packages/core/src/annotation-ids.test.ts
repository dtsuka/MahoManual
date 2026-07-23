import { describe, expect, it } from "vitest";
import type { AnnotationObject } from "./schema.js";
import { createObjectId, nextBadgeNumber } from "./annotation-ids.js";

describe("createObjectId", () => {
  it("種別ごとのプレフィックスと連番でIDを生成する", () => {
    const objects: AnnotationObject[] = [
      { id: "b1", type: "badge", source: "manual", n: 1, at: { x: 10, y: 20 } },
    ];
    expect(createObjectId("badge", objects)).toBe("b2");
    expect(createObjectId("text", objects)).toBe("t1");
    expect(createObjectId("cursor", objects)).toBe("c1");
    expect(createObjectId("frame", objects)).toBe("f1");
    expect(createObjectId("line", objects)).toBe("l1");
    expect(createObjectId("image", objects)).toBe("img1");
    expect(createObjectId("mosaic", objects)).toBe("m1");
    expect(createObjectId("arrow", objects)).toBe("a1");
  });

  it("既存IDと衝突する場合は次の連番を採用する", () => {
    const objects: AnnotationObject[] = [
      { id: "b1", type: "badge", source: "manual", n: 1, at: { x: 10, y: 20 } },
      { id: "b2", type: "badge", source: "manual", n: 2, at: { x: 30, y: 40 } },
    ];
    expect(createObjectId("badge", objects)).toBe("b3");
  });

  it("種別数と無関係のIDが既存でも衝突を避ける", () => {
    const objects: AnnotationObject[] = [
      { id: "t1", type: "text", source: "manual", content: "hi", at: { x: 0, y: 0 } },
    ];
    expect(createObjectId("text", objects)).toBe("t2");
  });
});

describe("nextBadgeNumber", () => {
  it("バッジが存在する場合は最大値+1を返す", () => {
    const objects: AnnotationObject[] = [
      { id: "b1", type: "badge", source: "manual", n: 1, at: { x: 0, y: 0 } },
      { id: "b2", type: "badge", source: "manual", n: 5, at: { x: 0, y: 0 } },
    ];
    expect(nextBadgeNumber(objects)).toBe(6);
  });

  it("バッジが存在しない場合は1を返す", () => {
    const objects: AnnotationObject[] = [
      { id: "f1", type: "frame", source: "manual", rect: { x: 0, y: 0, w: 10, h: 10 } },
    ];
    expect(nextBadgeNumber(objects)).toBe(1);
  });
});
