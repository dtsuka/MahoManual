import type { AnnotationObject } from "@mahomanual/core/schema";
import {
  translateObjects,
  type PointPct,
  type SnapGuide,
} from "@mahomanual/core/object-geometry";
import { duplicateObjects } from "./annotation-operations.js";
import { dragSnapDelta } from "./editor-snap.js";
import type { PreparedObjectDragSession } from "./object-drag-session.js";

export interface TranslateDragDelta {
  dx: number;
  dy: number;
  dragIdSet: Set<string>;
  activeGuides: SnapGuide[];
}

export interface TranslateDragPreview {
  objects: AnnotationObject[];
  activeGuides: SnapGuide[];
}

export interface TranslateDragCommitResult {
  objects: AnnotationObject[];
  selectedIds?: string[];
}

export function resolveTranslateDragDelta(options: {
  session: PreparedObjectDragSession;
  startPct: PointPct;
  currentPct: PointPct;
  thresholdPct: number;
  altKey: boolean;
}): TranslateDragDelta {
  const dragIdSet = new Set(options.session.dragIds);
  const rawDx = options.currentPct.x - options.startPct.x;
  const rawDy = options.currentPct.y - options.startPct.y;
  const snapped = dragSnapDelta(
    options.session.workingObjects,
    dragIdSet,
    rawDx,
    rawDy,
    options.thresholdPct,
    options.altKey,
  );
  return {
    dx: snapped.dx,
    dy: snapped.dy,
    dragIdSet,
    activeGuides: snapped.activeGuides,
  };
}

export function previewTranslateDrag(options: {
  session: PreparedObjectDragSession;
  startPct: PointPct;
  currentPct: PointPct;
  thresholdPct: number;
  altKey: boolean;
}): TranslateDragPreview {
  const { dx, dy, dragIdSet, activeGuides } = resolveTranslateDragDelta(options);
  return {
    objects: translateObjects(options.session.workingObjects, dragIdSet, dx, dy),
    activeGuides,
  };
}

export function commitTranslateDrag(options: {
  session: PreparedObjectDragSession;
  startPct: PointPct;
  currentPct: PointPct;
  thresholdPct: number;
  altKeyAtDown: boolean;
  altKeyAtEnd: boolean;
  latestObjects: AnnotationObject[];
}): TranslateDragCommitResult {
  const { dx, dy, dragIdSet } = resolveTranslateDragDelta({
    session: options.session,
    startPct: options.startPct,
    currentPct: options.currentPct,
    thresholdPct: options.thresholdPct,
    altKey: options.altKeyAtEnd,
  });

  if (options.altKeyAtDown) {
    const duplicated = duplicateObjects(options.latestObjects, options.session.originalDragIds, 0);
    return {
      objects: translateObjects(
        duplicated.objects,
        new Set(duplicated.selectedIds),
        dx,
        dy,
      ),
      selectedIds: duplicated.selectedIds,
    };
  }

  return {
    objects: translateObjects(options.latestObjects, dragIdSet, dx, dy),
  };
}
