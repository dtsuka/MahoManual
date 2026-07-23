import { describe, expect, it } from "vitest";
import {
  applyLinePointRemoval,
  nextPointSelectionIndices,
  nextSelectedPointsAfterRemoval,
  removeLinePointsAt,
  resolvePointPointerDownSelection,
  snapDraggedLinePoint,
  translateSelectedPoints,
} from "./line-point-selection.js";

describe("nextPointSelectionIndices", () => {
  it("未選択点の通常クリックは単一選択にする", () => {
    expect(nextPointSelectionIndices([0, 2], 1, false)).toEqual([1]);
  });

  it("既に単独選択中の点を通常クリックしても維持する", () => {
    expect(nextPointSelectionIndices([1], 1, false)).toEqual([1]);
  });

  it("複数選択中の点を通常クリックしても複数選択を維持する", () => {
    expect(nextPointSelectionIndices([0, 2], 2, false)).toEqual([0, 2]);
  });

  it("加算クリックで未選択点を追加する", () => {
    expect(nextPointSelectionIndices([0], 2, true)).toEqual([0, 2]);
  });

  it("加算クリックで選択中の点を外す", () => {
    expect(nextPointSelectionIndices([0, 2], 0, true)).toEqual([2]);
  });
});

describe("resolvePointPointerDownSelection", () => {
  it("加算で未選択点を掴むと即追加し、ドラッグ対象にも含める", () => {
    expect(resolvePointPointerDownSelection([0], 2, true)).toEqual({
      dragIndices: [0, 2],
      immediateSelection: [0, 2],
      clickSelection: null,
    });
  });

  it("加算で既選択点を掴むとドラッグは維持し、クリック確定時だけ解除する", () => {
    expect(resolvePointPointerDownSelection([0, 2], 0, true)).toEqual({
      dragIndices: [0, 2],
      immediateSelection: [0, 2],
      clickSelection: [2],
    });
  });

  it("通常の未選択クリックは単一選択にする", () => {
    expect(resolvePointPointerDownSelection([0, 2], 1, false)).toEqual({
      dragIndices: [1],
      immediateSelection: [1],
      clickSelection: null,
    });
  });
});

describe("snapDraggedLinePoint", () => {
  const points = [
    { x: 20, y: 20 },
    { x: 40, y: 20 },
    { x: 60, y: 40 },
  ];

  it("単一点の Shift では隣接点基準で水平にスナップする", () => {
    const snapped = snapDraggedLinePoint({ x: 40, y: 25 }, {
      shiftKey: true,
      primaryIndex: 1,
      primaryStart: points[1]!,
      points,
      dragIndices: [1],
    });
    expect(snapped.y).toBeCloseTo(20, 5);
    expect(snapped.x).toBeGreaterThan(20);
  });

  it("複数点の Shift では掴んだ点の開始位置基準で移動方向をスナップする", () => {
    const primaryStart = points[2]!;
    const snapped = snapDraggedLinePoint({ x: 70, y: 42 }, {
      shiftKey: true,
      primaryIndex: 2,
      primaryStart,
      points,
      dragIndices: [0, 2],
    });
    expect(snapped.y).toBeCloseTo(primaryStart.y, 5);
    expect(snapped.x).toBeGreaterThan(primaryStart.x);
  });

  it("Shift なしでは座標を変えない", () => {
    const point = { x: 70, y: 42 };
    expect(snapDraggedLinePoint(point, {
      shiftKey: false,
      primaryIndex: 2,
      primaryStart: points[2]!,
      points,
      dragIndices: [0, 2],
    })).toEqual(point);
  });
});

describe("translateSelectedPoints", () => {
  const points = [
    { x: 10, y: 20 },
    { x: 30, y: 40 },
    { x: 50, y: 60 },
  ];

  it("選択点だけを同じ量だけ移動する", () => {
    expect(translateSelectedPoints(points, [0, 2], 1, -2)).toEqual([
      { x: 11, y: 18 },
      { x: 30, y: 40 },
      { x: 51, y: 58 },
    ]);
  });

  it("選択が空なら元の点列を返す", () => {
    expect(translateSelectedPoints(points, [], 5, 5)).toEqual(points);
  });
});

describe("removeLinePointsAt", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 20, y: 10 },
    { x: 30, y: 10 },
  ];

  it("複数点を削除する", () => {
    expect(removeLinePointsAt(points, [1, 2])).toEqual([
      { x: 0, y: 0 },
      { x: 30, y: 10 },
    ]);
  });

  it("残点が2未満になる削除は null", () => {
    expect(removeLinePointsAt(points, [0, 1, 2])).toBeNull();
  });
});

describe("nextSelectedPointsAfterRemoval", () => {
  it("削除した点を外し、後ろのインデックスを繰り上げる", () => {
    expect(nextSelectedPointsAfterRemoval([0, 2, 3], [1, 3])).toEqual([0, 1]);
  });

  it("すべて削除対象なら空配列", () => {
    expect(nextSelectedPointsAfterRemoval([1, 2], [1, 2])).toEqual([]);
  });
});

describe("applyLinePointRemoval", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 20, y: 10 },
    { x: 30, y: 10 },
  ];

  it("clickedIndex 省略時は選択点を削除する", () => {
    expect(applyLinePointRemoval(points, [1, 2])).toEqual({
      points: [
        { x: 0, y: 0 },
        { x: 30, y: 10 },
      ],
      selectedIndices: [],
    });
  });

  it("複数選択に含まれる点の X はまとめて削除する", () => {
    expect(applyLinePointRemoval(points, [0, 2], 2)).toEqual({
      points: [
        { x: 10, y: 0 },
        { x: 30, y: 10 },
      ],
      selectedIndices: [],
    });
  });

  it("単独クリックの点だけ削除する", () => {
    expect(applyLinePointRemoval(points, [0], 2)).toEqual({
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 30, y: 10 },
      ],
      selectedIndices: [0],
    });
  });
});
