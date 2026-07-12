import type { AnnotationObject } from "@mahomanual/core/schema";
import { duplicateObjects } from "./annotation-operations.js";

/** 単一オブジェクトに対する通常 / 加算選択の次の ID 一覧 */
export function nextSelectionIds(
  selectedIds: readonly string[],
  objectId: string,
  additive: boolean,
): string[] {
  const wasSelected = selectedIds.includes(objectId);
  if (additive) {
    return wasSelected
      ? selectedIds.filter((id) => id !== objectId)
      : [...selectedIds, objectId];
  }
  return wasSelected ? [...selectedIds] : [objectId];
}

export interface PreparedObjectDragSession {
  /** Alt 複製・平行移動の元になる選択 ID（ポインタ down 時点） */
  originalDragIds: string[];
  /** UI に反映する選択 ID（Alt 時は複製側） */
  nextSelectedIds: string[];
  /** ドラッグ中に動かすオブジェクト列（Alt 時は複製済み） */
  workingObjects: AnnotationObject[];
  /** 実際に平行移動する ID */
  dragIds: string[];
}

/**
 * オブジェクト平行移動ドラッグの開始状態を一回だけ組み立てる。
 * 「いつ確定するか」は呼び出し側の責務（即時 / 初回 move）。
 */
export function prepareObjectDragSession(options: {
  objects: AnnotationObject[];
  selectedIds: readonly string[];
  objectId: string;
  additive: boolean;
  altKey: boolean;
}): PreparedObjectDragSession {
  const originalDragIds = options.selectedIds.includes(options.objectId)
    ? [...options.selectedIds]
    : [options.objectId];

  if (options.altKey) {
    const duplicated = duplicateObjects(options.objects, originalDragIds, 0);
    return {
      originalDragIds,
      nextSelectedIds: duplicated.selectedIds,
      workingObjects: duplicated.objects,
      dragIds: duplicated.selectedIds,
    };
  }

  return {
    originalDragIds,
    nextSelectedIds: nextSelectionIds(options.selectedIds, options.objectId, options.additive),
    workingObjects: options.objects,
    dragIds: originalDragIds,
  };
}
