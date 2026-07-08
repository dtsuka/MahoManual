export interface RectPct {
  x: number;
  y: number;
  w: number;
  h: number;
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
