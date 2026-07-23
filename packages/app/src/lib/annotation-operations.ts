import type { AnnotationObject } from "@mahomanual/core/schema";
import { isEditable } from "@mahomanual/core/annotation-objects";
import {
  duplicateObjects as coreDuplicateObjects,
} from "@mahomanual/core/object-geometry";
import { createObjectId } from "@mahomanual/core/annotation-ids";

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

export { clampCrop } from "@mahomanual/core/crop-math";

export {
  alignObjects,
  collectSnapGuides,
  distributeObjects,
  objectsInRect,
  reorderObject,
  snapPointToGuides,
  snapThresholdPct,
  translateObjects,
} from "@mahomanual/core/object-geometry";
