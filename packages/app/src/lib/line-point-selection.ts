import { snapAngle, type PointPct } from "./geometry.js";

export interface PointPointerDownSelection {
  /** ドラッグ開始時点で動かす点 */
  dragIndices: number[];
  /** すぐ UI へ反映する選択 */
  immediateSelection: number[];
  /**
   * 移動なしの pointerup で適用する選択。
   * 加算+既選択のトグル解除を、Shift ドラッグ(角度スナップ)と両立するために遅延する。
   */
  clickSelection: number[] | null;
}

/**
 * 点ハンドルの pointerdown 時の選択/ドラッグ対象を決める。
 * Shift+クリック(加算解除)と Shift+ドラッグ(角度スナップ)を切り分ける。
 */
export function resolvePointPointerDownSelection(
  selected: readonly number[],
  index: number,
  additive: boolean,
): PointPointerDownSelection {
  const wasSelected = selected.includes(index);
  if (!additive) {
    const next = wasSelected ? [...selected] : [index];
    return {
      dragIndices: next,
      immediateSelection: next,
      clickSelection: null,
    };
  }
  if (wasSelected) {
    return {
      dragIndices: [...selected],
      immediateSelection: [...selected],
      clickSelection: selected.filter((item) => item !== index),
    };
  }
  const next = [...selected, index].sort((a, b) => a - b);
  return {
    dragIndices: next,
    immediateSelection: next,
    clickSelection: null,
  };
}

/**
 * パネルなどドラッグが無い UI 向けの即時選択。
 * pointerdown 解決の committed selection(click 確定後)と同じ規則にする。
 */
export function nextPointSelectionIndices(
  selected: readonly number[],
  index: number,
  additive: boolean,
): number[] {
  const resolved = resolvePointPointerDownSelection(selected, index, additive);
  return resolved.clickSelection ?? resolved.immediateSelection;
}

/**
 * Shift ドラッグ時の主点位置を決める。
 * - 単一点: 隣接点を基準に線分角度を 45° 刻みへ
 * - 複数点: 掴んだ点(最後にクリックした点)の開始位置を基準に移動方向を 45° 刻みへ
 */
export function snapDraggedLinePoint(
  point: PointPct,
  options: {
    shiftKey: boolean;
    primaryIndex: number;
    primaryStart: PointPct;
    points: readonly PointPct[];
    dragIndices: readonly number[];
  },
): PointPct {
  if (!options.shiftKey) {
    return point;
  }
  if (options.dragIndices.length <= 1) {
    const anchor =
      options.points[options.primaryIndex - 1]
      ?? options.points[options.primaryIndex + 1];
    return anchor ? snapAngle(point, anchor) : point;
  }
  return snapAngle(point, options.primaryStart);
}

/** 選択中の点を同じ dx/dy(%) だけ平行移動する */
export function translateSelectedPoints(
  points: readonly PointPct[],
  indices: readonly number[],
  dx: number,
  dy: number,
): PointPct[] {
  if (indices.length === 0 || (dx === 0 && dy === 0)) {
    return [...points];
  }
  const moving = new Set(indices);
  return points.map((point, index) => (
    moving.has(index) ? { x: point.x + dx, y: point.y + dy } : point
  ));
}

/**
 * 複数点をまとめて削除する。線分として成立する最低2点は残す。
 * 削除できない場合は null。
 */
export function removeLinePointsAt(
  points: readonly PointPct[],
  indices: readonly number[],
): PointPct[] | null {
  if (indices.length === 0) {
    return null;
  }
  const removing = new Set(indices.filter((index) => index >= 0 && index < points.length));
  if (removing.size === 0) {
    return null;
  }
  if (points.length - removing.size < 2) {
    return null;
  }
  return points.filter((_, index) => !removing.has(index));
}

/** 複数点削除後の選択インデックス。削除分を除き、後ろの点は繰り上げる */
export function nextSelectedPointsAfterRemoval(
  selected: readonly number[],
  removed: readonly number[],
): number[] {
  if (selected.length === 0) {
    return [];
  }
  const removing = [...removed].sort((a, b) => a - b);
  const next: number[] = [];
  for (const index of selected) {
    if (removing.includes(index)) {
      continue;
    }
    const shift = removing.filter((item) => item < index).length;
    next.push(index - shift);
  }
  return next;
}

/**
 * 点削除のターゲット解決と選択更新を1箇所にまとめる。
 * clickedIndex 省略時は選択中の点を削除(キーボード Delete)。
 * 指定時は、複数選択に含まれる点ならまとめて、そうでなければその1点だけ。
 */
export function applyLinePointRemoval(
  points: readonly PointPct[],
  selectedIndices: readonly number[],
  clickedIndex?: number,
): { points: PointPct[]; selectedIndices: number[] } | null {
  const targets = clickedIndex === undefined
    ? selectedIndices
    : selectedIndices.includes(clickedIndex) && selectedIndices.length > 1
      ? selectedIndices
      : [clickedIndex];
  const nextPoints = removeLinePointsAt(points, targets);
  if (!nextPoints) {
    return null;
  }
  return {
    points: nextPoints,
    selectedIndices: nextSelectedPointsAfterRemoval(selectedIndices, targets),
  };
}
