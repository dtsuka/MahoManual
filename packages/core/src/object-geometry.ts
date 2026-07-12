import type { AnnotationObject } from "./schema.js";
import { isEditable } from "./annotation-objects.js";

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

/** 画像の実ピクセル(またはcrop)をキャンバス座標へ1:1で写し、現在矩形の中心を維持する */
export function rectAtPixelSize(
  current: RectPct,
  canvas: { width: number; height: number },
  pixelSize: { w: number; h: number },
): RectPct {
  const w = (pixelSize.w / canvas.width) * 100;
  const h = (pixelSize.h / canvas.height) * 100;
  return {
    x: current.x + current.w / 2 - w / 2,
    y: current.y + current.h / 2 - h / 2,
    w,
    h,
  };
}

export interface ObjectBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SnapGuide {
  axis: "x" | "y";
  value: number;
}

const DEFAULT_BADGE_RADIUS_PCT = 1.1;
const DEFAULT_CURSOR_RADIUS_PCT = 1.4;

function translateObject(obj: AnnotationObject, dx: number, dy: number): AnnotationObject {
  switch (obj.type) {
    case "badge":
    case "text":
    case "cursor":
      return { ...obj, at: { x: obj.at.x + dx, y: obj.at.y + dy } };
    case "frame":
    case "image":
    case "mosaic":
      return { ...obj, rect: { ...obj.rect, x: obj.rect.x + dx, y: obj.rect.y + dy } };
    case "line":
    case "arrow":
      return {
        ...obj,
        points: obj.points.map((point) => ({ x: point.x + dx, y: point.y + dy })),
      };
    default: {
      const _exhaustive: never = obj;
      return _exhaustive;
    }
  }
}

export function objectBounds(obj: AnnotationObject): ObjectBounds | null {
  switch (obj.type) {
    case "badge": {
      const r = DEFAULT_BADGE_RADIUS_PCT;
      return { x: obj.at.x - r, y: obj.at.y - r, w: r * 2, h: r * 2 };
    }
    case "text": {
      const r = 2;
      return { x: obj.at.x - r, y: obj.at.y - r, w: r * 2, h: r * 2 };
    }
    case "cursor": {
      const r = DEFAULT_CURSOR_RADIUS_PCT;
      return { x: obj.at.x - r, y: obj.at.y - r, w: r * 2, h: r * 2 };
    }
    case "frame":
    case "image":
    case "mosaic":
      return { ...obj.rect };
    case "line":
    case "arrow": {
      if (obj.points.length === 0) {
        return null;
      }
      const xs = obj.points.map((point) => point.x);
      const ys = obj.points.map((point) => point.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
    default: {
      const _exhaustive: never = obj;
      return _exhaustive;
    }
  }
}

export function translateObjects(
  objects: AnnotationObject[],
  selectedIds: ReadonlySet<string>,
  dx: number,
  dy: number,
): AnnotationObject[] {
  return objects.map((obj) =>
    selectedIds.has(obj.id) && isEditable(obj) ? translateObject(obj, dx, dy) : obj,
  );
}

export function duplicateObjects(
  objects: AnnotationObject[],
  selectedIds: readonly string[],
  createId: (type: AnnotationObject["type"], existing: AnnotationObject[]) => string,
  offset = 1,
): { objects: AnnotationObject[]; selectedIds: string[] } {
  const selected = new Set(selectedIds);
  const copies: AnnotationObject[] = [];
  const all = [...objects];
  for (const obj of objects) {
    if (!selected.has(obj.id) || !isEditable(obj)) {
      continue;
    }
    const id = createId(obj.type, all);
    const copy = { ...translateObject(obj, offset, offset), id, source: "manual" as const };
    copies.push(copy);
    all.push(copy);
  }
  return { objects: [...objects, ...copies], selectedIds: copies.map((obj) => obj.id) };
}

export function reorderObject(
  objects: AnnotationObject[],
  ids: readonly string[],
  direction: "forward" | "backward",
): AnnotationObject[] {
  const selected = new Set(ids);
  const next = [...objects];
  const indices = next
    .map((obj, index) => ({ obj, index }))
    .filter(({ obj }) => selected.has(obj.id) && isEditable(obj))
    .map(({ index }) => index);
  if (indices.length === 0) {
    return next;
  }
  if (direction === "forward") {
    for (let i = indices.length - 1; i >= 0; i -= 1) {
      const index = indices[i]!;
      if (index >= next.length - 1) {
        continue;
      }
      const [item] = next.splice(index, 1);
      if (item) {
        next.splice(index + 1, 0, item);
      }
    }
    return next;
  }
  for (const index of indices) {
    if (index <= 0) {
      continue;
    }
    const [item] = next.splice(index, 1);
    if (item) {
      next.splice(index - 1, 0, item);
    }
  }
  return next;
}

type AlignEdge = "start" | "center" | "end";

function edgeValue(bounds: ObjectBounds, axis: "horizontal" | "vertical", edge: AlignEdge): number {
  if (axis === "horizontal") {
    if (edge === "start") {
      return bounds.x;
    }
    if (edge === "end") {
      return bounds.x + bounds.w;
    }
    return bounds.x + bounds.w / 2;
  }
  if (edge === "start") {
    return bounds.y;
  }
  if (edge === "end") {
    return bounds.y + bounds.h;
  }
  return bounds.y + bounds.h / 2;
}

function setEdgeValue(
  obj: AnnotationObject,
  axis: "horizontal" | "vertical",
  edge: AlignEdge,
  value: number,
): AnnotationObject {
  const bounds = objectBounds(obj);
  if (!bounds) {
    return obj;
  }
  const current = edgeValue(bounds, axis, edge);
  const delta = value - current;
  if (axis === "horizontal") {
    return translateObject(obj, delta, 0);
  }
  return translateObject(obj, 0, delta);
}

export function alignObjects(
  objects: AnnotationObject[],
  ids: readonly string[],
  axis: "horizontal" | "vertical",
  edge: AlignEdge,
): AnnotationObject[] {
  const selected = new Set(ids);
  const targets = objects.filter((obj) => selected.has(obj.id) && isEditable(obj));
  if (targets.length < 2) {
    return objects;
  }
  const values = targets
    .map((obj) => objectBounds(obj))
    .filter((bounds): bounds is ObjectBounds => bounds !== null)
    .map((bounds) => edgeValue(bounds, axis, edge));
  const targetValue = edge === "start" ? Math.min(...values) : edge === "end" ? Math.max(...values) : values.reduce((sum, v) => sum + v, 0) / values.length;
  return objects.map((obj) =>
    selected.has(obj.id) && isEditable(obj) ? setEdgeValue(obj, axis, edge, targetValue) : obj,
  );
}

export function distributeObjects(
  objects: AnnotationObject[],
  ids: readonly string[],
  axis: "horizontal" | "vertical",
): AnnotationObject[] {
  const selected = new Set(ids);
  const targets = objects
    .filter((obj) => selected.has(obj.id) && isEditable(obj))
    .map((obj) => ({ obj, bounds: objectBounds(obj) }))
    .filter((entry): entry is { obj: AnnotationObject; bounds: ObjectBounds } => entry.bounds !== null);
  if (targets.length < 3) {
    return objects;
  }
  const sorted = [...targets].sort((a, b) =>
    axis === "horizontal" ? a.bounds.x - b.bounds.x : a.bounds.y - b.bounds.y,
  );
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const start = edgeValue(first.bounds, axis, "start");
  const end = edgeValue(last.bounds, axis, "end");
  const span = end - start;
  const totalSize = sorted.reduce(
    (sum, entry) => sum + (axis === "horizontal" ? entry.bounds.w : entry.bounds.h),
    0,
  );
  const gap = (span - totalSize) / (sorted.length - 1);
  let cursor = start;
  const positions = new Map<string, number>();
  for (const entry of sorted) {
    positions.set(entry.obj.id, cursor);
    cursor += (axis === "horizontal" ? entry.bounds.w : entry.bounds.h) + gap;
  }
  return objects.map((obj) => {
    if (!selected.has(obj.id) || !isEditable(obj)) {
      return obj;
    }
    const bounds = objectBounds(obj);
    const nextStart = positions.get(obj.id);
    if (!bounds || nextStart === undefined) {
      return obj;
    }
    const currentStart = edgeValue(bounds, axis, "start");
    const delta = nextStart - currentStart;
    return axis === "horizontal" ? translateObject(obj, delta, 0) : translateObject(obj, 0, delta);
  });
}

export function collectSnapGuides(
  objects: readonly AnnotationObject[],
  selectedIds: ReadonlySet<string>,
  movingIds: ReadonlySet<string>,
): SnapGuide[] {
  const guides: SnapGuide[] = [
    { axis: "x", value: 50 },
    { axis: "y", value: 50 },
  ];
  for (const obj of objects) {
    if (selectedIds.has(obj.id) || movingIds.has(obj.id)) {
      continue;
    }
    const bounds = objectBounds(obj);
    if (!bounds) {
      continue;
    }
    guides.push(
      { axis: "x", value: bounds.x },
      { axis: "x", value: bounds.x + bounds.w / 2 },
      { axis: "x", value: bounds.x + bounds.w },
      { axis: "y", value: bounds.y },
      { axis: "y", value: bounds.y + bounds.h / 2 },
      { axis: "y", value: bounds.y + bounds.h },
    );
  }
  return guides;
}

export function snapPointToGuides(
  point: PointPct,
  guides: readonly SnapGuide[],
  thresholdPct: number,
  disabled: boolean,
): { point: PointPct; activeGuides: SnapGuide[] } {
  if (disabled) {
    return { point, activeGuides: [] };
  }
  let { x, y } = point;
  const activeGuides: SnapGuide[] = [];
  let bestDx = thresholdPct;
  let bestDy = thresholdPct;
  for (const guide of guides) {
    if (guide.axis === "x") {
      const dx = Math.abs(point.x - guide.value);
      if (dx <= bestDx) {
        bestDx = dx;
        x = guide.value;
        activeGuides.push(guide);
      }
    } else {
      const dy = Math.abs(point.y - guide.value);
      if (dy <= bestDy) {
        bestDy = dy;
        y = guide.value;
        activeGuides.push(guide);
      }
    }
  }
  return { point: { x, y }, activeGuides };
}

export function snapThresholdPct(
  zoomPercent: number,
  canvasSizePx: number,
  thresholdScreenPx = 6,
): number {
  if (zoomPercent <= 0 || canvasSizePx <= 0) {
    return 0;
  }
  return (thresholdScreenPx / canvasSizePx) * 100 * (100 / zoomPercent);
}

export function objectsInRect(
  objects: readonly AnnotationObject[],
  rect: RectPct,
  excludeLocked = true,
): string[] {
  const right = rect.x + rect.w;
  const bottom = rect.y + rect.h;
  const ids: string[] = [];
  for (const obj of objects) {
    if (excludeLocked && !isEditable(obj)) {
      continue;
    }
    const bounds = objectBounds(obj);
    if (!bounds) {
      continue;
    }
    const objRight = bounds.x + bounds.w;
    const objBottom = bounds.y + bounds.h;
    const intersects =
      bounds.x < right && objRight > rect.x && bounds.y < bottom && objBottom > rect.y;
    if (intersects) {
      ids.push(obj.id);
    }
  }
  return ids;
}
