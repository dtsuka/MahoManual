import type { AnnotationObject } from "@mahomanual/core/schema";
import {
  collectSnapGuides,
  objectBounds,
  snapPointToGuides,
  type SnapGuide,
} from "@mahomanual/core/object-geometry";

export function dragSnapDelta(
  objects: readonly AnnotationObject[],
  dragIds: ReadonlySet<string>,
  dx: number,
  dy: number,
  thresholdPct: number,
  altKey: boolean,
): { dx: number; dy: number; activeGuides: SnapGuide[] } {
  if (altKey || dragIds.size === 0) {
    return { dx, dy, activeGuides: [] };
  }
  const primary = objects.find((obj) => dragIds.has(obj.id));
  if (!primary) {
    return { dx, dy, activeGuides: [] };
  }
  const bounds = objectBounds(primary);
  if (!bounds) {
    return { dx, dy, activeGuides: [] };
  }
  const guides = collectSnapGuides(objects, new Set(), dragIds);
  const snapped = snapPointToGuides(
    { x: bounds.x + dx, y: bounds.y + dy },
    guides,
    thresholdPct,
    false,
  );
  return {
    dx: snapped.point.x - bounds.x,
    dy: snapped.point.y - bounds.y,
    activeGuides: snapped.activeGuides,
  };
}
