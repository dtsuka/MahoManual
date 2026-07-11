import type { AnnotationObject } from "@mahomanual/core/schema";
import { createObjectId } from "./api.js";

interface Size {
  w: number;
  h: number;
}

interface Crop extends Size {
  x: number;
  y: number;
}

function translateObject(obj: AnnotationObject, dx: number, dy: number): AnnotationObject {
  switch (obj.type) {
    case "badge":
    case "text":
    case "cursor":
      return { ...obj, at: { x: obj.at.x + dx, y: obj.at.y + dy } };
    case "frame":
    case "image":
      return { ...obj, rect: { ...obj.rect, x: obj.rect.x + dx, y: obj.rect.y + dy } };
    case "line":
    case "arrow":
      return {
        ...obj,
        points: obj.points.map((point) => ({ x: point.x + dx, y: point.y + dy })),
      };
  }
}

export function translateObjects(
  objects: AnnotationObject[],
  selectedIds: ReadonlySet<string>,
  dx: number,
  dy: number,
): AnnotationObject[] {
  return objects.map((obj) => selectedIds.has(obj.id) && !obj.locked ? translateObject(obj, dx, dy) : obj);
}

export function removeUnlockedObjects(
  objects: AnnotationObject[],
  selectedIds: ReadonlySet<string>,
): AnnotationObject[] {
  return objects.filter((obj) => !selectedIds.has(obj.id) || obj.locked);
}

export function duplicateObjects(
  objects: AnnotationObject[],
  selectedIds: readonly string[],
  offset = 1,
): { objects: AnnotationObject[]; selectedIds: string[] } {
  const selected = new Set(selectedIds);
  const copies: AnnotationObject[] = [];
  const all = [...objects];
  for (const obj of objects) {
    if (!selected.has(obj.id)) {
      continue;
    }
    const id = createObjectId(obj.type, all);
    const copy = { ...translateObject(obj, offset, offset), id, source: "manual" as const };
    copies.push(copy);
    all.push(copy);
  }
  return { objects: [...objects, ...copies], selectedIds: copies.map((obj) => obj.id) };
}

export function clampCrop(crop: Crop, natural: Size): Crop {
  const x = Math.max(0, Math.min(crop.x, natural.w - 1));
  const y = Math.max(0, Math.min(crop.y, natural.h - 1));
  return {
    x,
    y,
    w: Math.max(1, Math.min(crop.w, natural.w - x)),
    h: Math.max(1, Math.min(crop.h, natural.h - y)),
  };
}
