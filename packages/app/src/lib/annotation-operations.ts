import type { AnnotationObject } from "@mahomanual/core/schema";
import {
  clampCrop as coreClampCrop,
} from "@mahomanual/core/crop-math";
import {
  duplicateObjects as coreDuplicateObjects,
  translateObjects as coreTranslateObjects,
} from "@mahomanual/core/object-geometry";
import { isEditable } from "@mahomanual/core/annotation-objects";
import { createObjectId } from "./api.js";

interface Size {
  w: number;
  h: number;
}

interface Crop extends Size {
  x: number;
  y: number;
}

export function translateObjects(
  objects: AnnotationObject[],
  selectedIds: ReadonlySet<string>,
  dx: number,
  dy: number,
): AnnotationObject[] {
  return coreTranslateObjects(objects, selectedIds, dx, dy);
}

export function removeUnlockedObjects(
  objects: AnnotationObject[],
  selectedIds: ReadonlySet<string>,
): AnnotationObject[] {
  return objects.filter((obj) => !selectedIds.has(obj.id) || !isEditable(obj));
}

export function duplicateObjects(
  objects: AnnotationObject[],
  selectedIds: readonly string[],
  offset = 1,
): { objects: AnnotationObject[]; selectedIds: string[] } {
  return coreDuplicateObjects(objects, selectedIds, createObjectId, offset);
}

export function clampCrop(crop: Crop, natural: Size): Crop {
  return coreClampCrop(crop, natural);
}

export {
  alignObjects,
  collectSnapGuides,
  distributeObjects,
  objectsInRect,
  reorderObject,
  snapPointToGuides,
  snapThresholdPct,
} from "@mahomanual/core/object-geometry";
