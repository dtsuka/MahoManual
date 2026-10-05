import type { AnnotationFile, AnnotationObject } from "./schema.js";

export type MergeConflictReason =
  | "both_modified"
  | "local_deleted_remote_modified"
  | "local_modified_remote_deleted"
  | "order_conflict"
  | "canvas_conflict";

export interface ObjectConflict {
  id: string;
  reason: MergeConflictReason;
  base?: AnnotationObject;
  local?: AnnotationObject;
  remote?: AnnotationObject;
}

export interface MergeAnnotationEditsResult {
  merged: AnnotationFile;
  conflicts: ObjectConflict[];
  autoMerged: boolean;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value);
}

function objectsById(objects: readonly AnnotationObject[]): Map<string, AnnotationObject> {
  return new Map(objects.map((obj) => [obj.id, obj]));
}

export function mergeAnnotationEdits(
  base: AnnotationFile,
  local: AnnotationFile,
  remote: AnnotationFile,
): MergeAnnotationEditsResult {
  // キャンバス寸法が変わると、その側の全オブジェクトの%座標は新しいキャンバス基準になる。
  // 片側がキャンバスを変え、もう片側がオブジェクトを変えた場合、両者の%座標は基準が異なるため
  // オブジェクト単位では合成できない。文書全体の競合として扱い、どちらか一方の版を選ばせる
  const canvasLocalChanged = stableStringify(local.canvas) !== stableStringify(base.canvas);
  const canvasRemoteChanged = stableStringify(remote.canvas) !== stableStringify(base.canvas);
  const localObjectsChanged = stableStringify(local.objects) !== stableStringify(base.objects);
  const remoteObjectsChanged = stableStringify(remote.objects) !== stableStringify(base.objects);
  const canvasConflict =
    (canvasLocalChanged && canvasRemoteChanged && stableStringify(local.canvas) !== stableStringify(remote.canvas)) ||
    (canvasLocalChanged && !canvasRemoteChanged && remoteObjectsChanged) ||
    (canvasRemoteChanged && !canvasLocalChanged && localObjectsChanged);
  if (canvasConflict) {
    return {
      merged: { version: 1, canvas: local.canvas, objects: [...local.objects] },
      conflicts: [{ id: "(canvas)", reason: "canvas_conflict" }],
      autoMerged: false,
    };
  }

  const conflicts: ObjectConflict[] = [];
  const baseMap = objectsById(base.objects);
  const localMap = objectsById(local.objects);
  const remoteMap = objectsById(remote.objects);
  const mergedObjects = new Map<string, AnnotationObject>();

  const allIds = new Set([...baseMap.keys(), ...localMap.keys(), ...remoteMap.keys()]);
  for (const id of allIds) {
    const baseObj = baseMap.get(id);
    const localObj = localMap.get(id);
    const remoteObj = remoteMap.get(id);
    const localChanged = stableStringify(localObj) !== stableStringify(baseObj);
    const remoteChanged = stableStringify(remoteObj) !== stableStringify(baseObj);

    if (!localObj && !remoteObj) {
      continue;
    }
    // 片側で削除され、もう片側では変更されていない → 削除を採用する
    if (!localObj && remoteObj && !remoteChanged) {
      continue;
    }
    if (!remoteObj && localObj && !localChanged) {
      continue;
    }
    if (!localObj && remoteObj && remoteChanged) {
      if (baseObj && localChanged) {
        conflicts.push({ id, reason: "local_deleted_remote_modified", base: baseObj, local: localObj, remote: remoteObj });
      } else {
        mergedObjects.set(id, remoteObj);
      }
      continue;
    }
    if (!remoteObj && localObj && localChanged) {
      if (baseObj && remoteChanged) {
        conflicts.push({ id, reason: "local_modified_remote_deleted", base: baseObj, local: localObj, remote: remoteObj });
      } else {
        mergedObjects.set(id, localObj);
      }
      continue;
    }
    if (localObj && remoteObj) {
      if (!localChanged && !remoteChanged) {
        mergedObjects.set(id, localObj);
        continue;
      }
      if (localChanged && !remoteChanged) {
        mergedObjects.set(id, localObj);
        continue;
      }
      if (!localChanged && remoteChanged) {
        mergedObjects.set(id, remoteObj);
        continue;
      }
      if (stableStringify(localObj) === stableStringify(remoteObj)) {
        mergedObjects.set(id, localObj);
        continue;
      }
      conflicts.push({ id, reason: "both_modified", base: baseObj, local: localObj, remote: remoteObj });
      mergedObjects.set(id, localObj);
    }
  }

  const sharedIds = [...allIds].filter((id) => baseMap.has(id));
  const baseOrder = base.objects.map((obj) => obj.id).filter((id) => sharedIds.includes(id)).join("\u0000");
  const localOrder = local.objects.map((obj) => obj.id).filter((id) => sharedIds.includes(id)).join("\u0000");
  const remoteOrder = remote.objects.map((obj) => obj.id).filter((id) => sharedIds.includes(id)).join("\u0000");
  const localOrderChanged = localOrder !== baseOrder;
  const remoteOrderChanged = remoteOrder !== baseOrder;
  if (localOrderChanged && remoteOrderChanged && localOrder !== remoteOrder) {
    conflicts.push({
      id: "(order)",
      reason: "order_conflict",
    });
  }

  const mergedCanvas = canvasRemoteChanged && !canvasLocalChanged ? remote.canvas : local.canvas;

  const orderSource = conflicts.some((conflict) => conflict.reason === "order_conflict")
    ? base.objects
    : remoteOrderChanged && !localOrderChanged
      ? remote.objects
      : local.objects;
  const mergedList: AnnotationObject[] = [];
  const seen = new Set<string>();
  for (const obj of orderSource) {
    const mergedObj = mergedObjects.get(obj.id);
    if (!mergedObj || seen.has(obj.id)) {
      continue;
    }
    mergedList.push(mergedObj);
    seen.add(obj.id);
  }
  for (const [id, obj] of mergedObjects) {
    if (!seen.has(id)) {
      mergedList.push(obj);
    }
  }

  return {
    merged: { version: 1, canvas: mergedCanvas, objects: mergedList },
    conflicts,
    autoMerged: conflicts.length === 0,
  };
}

export function resolveConflicts(
  merged: AnnotationFile,
  resolutions: Record<string, "local" | "remote">,
  context: {
    local: AnnotationFile;
    remote: AnnotationFile;
  },
): AnnotationFile {
  // キャンバスの競合は文書全体の競合(mergeAnnotationEdits 参照)。選んだ側の版をそのまま使う
  const canvasChoice = resolutions["(canvas)"];
  if (canvasChoice) {
    const chosen = canvasChoice === "remote" ? context.remote : context.local;
    return { version: 1, canvas: chosen.canvas, objects: [...chosen.objects] };
  }
  const localMap = objectsById(context.local.objects);
  const remoteMap = objectsById(context.remote.objects);
  const resolvedMap = new Map(merged.objects.map((obj) => [obj.id, obj]));
  for (const [id, choice] of Object.entries(resolutions)) {
    if (id === "(canvas)" || id === "(order)") {
      continue;
    }
    const obj = choice === "local" ? localMap.get(id) : remoteMap.get(id);
    if (obj) {
      resolvedMap.set(id, obj);
    } else {
      resolvedMap.delete(id);
    }
  }
  const orderChoice = resolutions["(order)"];
  const orderSource = orderChoice === "remote"
    ? context.remote.objects
    : orderChoice === "local"
      ? context.local.objects
      : merged.objects;
  const orderIds = orderSource.map((obj) => obj.id);
  const objects = [
    ...orderIds
      .map((id) => resolvedMap.get(id))
      .filter((obj): obj is AnnotationObject => obj !== undefined),
    ...[...resolvedMap.values()].filter((obj) => !orderIds.includes(obj.id)),
  ];
  return { version: 1, canvas: merged.canvas, objects };
}
