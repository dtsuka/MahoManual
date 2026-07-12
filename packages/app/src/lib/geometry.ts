export type { PointPct, RectPct } from "@mahomanual/core/object-geometry";
import type { PointPct, RectPct } from "@mahomanual/core/object-geometry";

// リサイズ後も rect が潰れない最小サイズ(%)。スキーマは w,h > 0 を要求する
export const MIN_RECT_PCT = 0.5;

export interface ResizeRectOptions {
  keepAspectRatio?: boolean;
}

// 8方向ハンドル(nw/n/ne/e/se/s/sw/w)によるリサイズ。
// dx/dy はドラッグ開始点からの移動量(%)。掴んでいない辺は固定される。
// keepAspectRatio 時は開始時の縦横比を維持する(Shift+ドラッグ用)
export function resizeRect(
  rect: RectPct,
  dir: string,
  dx: number,
  dy: number,
  options: ResizeRectOptions = {},
): RectPct {
  if (!options.keepAspectRatio || rect.w <= 0 || rect.h <= 0) {
    return resizeRectFree(rect, dir, dx, dy);
  }
  return resizeRectKeepAspect(rect, dir, dx, dy);
}

function resizeRectFree(rect: RectPct, dir: string, dx: number, dy: number): RectPct {
  let { x, y, w, h } = rect;
  if (dir.includes("e")) {
    w = Math.max(MIN_RECT_PCT, w + dx);
  }
  if (dir.includes("s")) {
    h = Math.max(MIN_RECT_PCT, h + dy);
  }
  if (dir.includes("w")) {
    const nextX = Math.min(x + dx, x + w - MIN_RECT_PCT);
    w -= nextX - x;
    x = nextX;
  }
  if (dir.includes("n")) {
    const nextY = Math.min(y + dy, y + h - MIN_RECT_PCT);
    h -= nextY - y;
    y = nextY;
  }
  return { x, y, w, h };
}

function resizeRectKeepAspect(rect: RectPct, dir: string, dx: number, dy: number): RectPct {
  const aspect = rect.w / rect.h;
  const isCorner = (dir.includes("n") || dir.includes("s")) && (dir.includes("e") || dir.includes("w"));

  if (isCorner) {
    const free = resizeRectFree(rect, dir, dx, dy);
    const widthDelta = Math.abs(free.w - rect.w);
    const heightDelta = Math.abs(free.h - rect.h);
    let w: number;
    let h: number;
    if (widthDelta >= heightDelta) {
      w = Math.max(MIN_RECT_PCT, free.w);
      h = Math.max(MIN_RECT_PCT, w / aspect);
    } else {
      h = Math.max(MIN_RECT_PCT, free.h);
      w = Math.max(MIN_RECT_PCT, h * aspect);
    }
    let x = rect.x;
    let y = rect.y;
    if (dir.includes("w")) {
      x = rect.x + rect.w - w;
    }
    if (dir.includes("n")) {
      y = rect.y + rect.h - h;
    }
    return { x, y, w, h };
  }

  if (dir === "e" || dir === "w") {
    const free = resizeRectFree(rect, dir, dx, 0);
    const w = Math.max(MIN_RECT_PCT, free.w);
    const h = Math.max(MIN_RECT_PCT, w / aspect);
    const y = rect.y + (rect.h - h) / 2;
    return { x: free.x, y, w, h };
  }

  if (dir === "n" || dir === "s") {
    const free = resizeRectFree(rect, dir, 0, dy);
    const h = Math.max(MIN_RECT_PCT, free.h);
    const w = Math.max(MIN_RECT_PCT, h * aspect);
    const x = rect.x + (rect.w - w) / 2;
    return { x, y: free.y, w, h };
  }

  return resizeRectFree(rect, dir, dx, dy);
}

// anchor から見た角度を 45° 刻みにスナップする(距離は保存)。
// Shift ドラッグで水平・垂直・斜め45°の線を引きやすくするための補助
export function snapAngle(point: PointPct, anchor: PointPct): PointPct {
  const dx = point.x - anchor.x;
  const dy = point.y - anchor.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) {
    return { ...point };
  }
  const step = Math.PI / 4;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  return {
    x: anchor.x + Math.cos(angle) * distance,
    y: anchor.y + Math.sin(angle) * distance,
  };
}

// 他の点の x / y 座標(ガイド)に threshold 以内で吸着する。
// x と y は独立に、最も近いガイドへスナップする
export function snapToGuides(point: PointPct, guides: PointPct[], threshold: number): PointPct {
  let { x, y } = point;
  let bestDx = threshold;
  let bestDy = threshold;
  for (const guide of guides) {
    const dx = Math.abs(point.x - guide.x);
    if (dx <= bestDx) {
      bestDx = dx;
      x = guide.x;
    }
    const dy = Math.abs(point.y - guide.y);
    if (dy <= bestDy) {
      bestDy = dy;
      y = guide.y;
    }
  }
  return { x, y };
}

export interface StickySnapState {
  x?: number;
  y?: number;
}

// ヒステリシス付きスナップ。吸着開始(snapDistance)より解除(releaseDistance)を
// 大きくすることで、閾値境界での吸着⇄解除の高速な往復(フリッカー)を防ぐ
export function stickySnap(
  point: PointPct,
  guides: PointPct[],
  previous: StickySnapState,
  snapDistance: number,
  releaseDistance: number,
): { point: PointPct; snapped: StickySnapState } {
  // 前回の吸着は解除距離以内なら維持する
  let snappedX =
    previous.x !== undefined && Math.abs(point.x - previous.x) <= releaseDistance
      ? previous.x
      : undefined;
  let snappedY =
    previous.y !== undefined && Math.abs(point.y - previous.y) <= releaseDistance
      ? previous.y
      : undefined;

  // 未吸着の軸のみ新規吸着を判定する
  if (snappedX === undefined || snappedY === undefined) {
    const fresh = snapToGuides(point, guides, snapDistance);
    if (snappedX === undefined && fresh.x !== point.x) {
      snappedX = fresh.x;
    }
    if (snappedY === undefined && fresh.y !== point.y) {
      snappedY = fresh.y;
    }
  }

  return {
    point: { x: snappedX ?? point.x, y: snappedY ?? point.y },
    snapped: { x: snappedX, y: snappedY },
  };
}

function distanceToSegment(point: PointPct, a: PointPct, b: PointPct): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSq = abx * abx + aby * aby;
  const t =
    lengthSq === 0
      ? 0
      : Math.max(0, Math.min(1, ((point.x - a.x) * abx + (point.y - a.y) * aby) / lengthSq));
  return Math.hypot(point.x - (a.x + t * abx), point.y - (a.y + t * aby));
}

// クリック位置に最も近い線分の index(点の挿入位置は index + 1)
export function nearestSegmentIndex(points: PointPct[], point: PointPct): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < points.length - 1; i += 1) {
    const distance = distanceToSegment(point, points[i]!, points[i + 1]!);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}
