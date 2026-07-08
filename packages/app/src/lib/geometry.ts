export interface RectPct {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PointPct {
  x: number;
  y: number;
}

// リサイズ後も rect が潰れない最小サイズ(%)。スキーマは w,h > 0 を要求する
export const MIN_RECT_PCT = 0.5;

// 8方向ハンドル(nw/n/ne/e/se/s/sw/w)によるリサイズ。
// dx/dy はドラッグ開始点からの移動量(%)。掴んでいない辺は固定される
export function resizeRect(rect: RectPct, dir: string, dx: number, dy: number): RectPct {
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
