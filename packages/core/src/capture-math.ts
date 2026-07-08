export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PointPct {
  x: number;
  y: number;
}

export interface RectPct {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type BadgeAnchor = "left" | "right" | "top" | "bottom" | "center";

export interface BadgePlacementOptions {
  anchor?: BadgeAnchor;
  offset?: { dx: number; dy: number };
  badgeOffsetPx?: number;
}

export function absoluteToPercent(point: { x: number; y: number }, region: Region): PointPct {
  return {
    x: ((point.x - region.x) / region.w) * 100,
    y: ((point.y - region.y) / region.h) * 100,
  };
}

export function badgePointFromBox(
  box: BoundingBox,
  region: Region,
  options: BadgePlacementOptions = {},
): PointPct {
  const badgeOffsetPx = options.badgeOffsetPx ?? 16;
  const offset = options.offset ?? { dx: 0, dy: 0 };
  const anchor = options.anchor ?? "left";

  let x = box.x;
  let y = box.y + box.h / 2;

  switch (anchor) {
    case "left":
      x = box.x - badgeOffsetPx;
      y = box.y + box.h / 2;
      break;
    case "right":
      x = box.x + box.w + badgeOffsetPx;
      y = box.y + box.h / 2;
      break;
    case "top":
      x = box.x + box.w / 2;
      y = box.y - badgeOffsetPx;
      break;
    case "bottom":
      x = box.x + box.w / 2;
      y = box.y + box.h + badgeOffsetPx;
      break;
    case "center":
      x = box.x + box.w / 2;
      y = box.y + box.h / 2;
      break;
    default: {
      const _exhaustive: never = anchor;
      return _exhaustive;
    }
  }

  return absoluteToPercent({ x: x + offset.dx, y: y + offset.dy }, region);
}

export function frameRectFromBox(box: BoundingBox, region: Region, padding = 4): RectPct {
  const x = box.x - padding;
  const y = box.y - padding;
  const w = box.w + padding * 2;
  const h = box.h + padding * 2;
  return {
    x: ((x - region.x) / region.w) * 100,
    y: ((y - region.y) / region.h) * 100,
    w: (w / region.w) * 100,
    h: (h / region.h) * 100,
  };
}
