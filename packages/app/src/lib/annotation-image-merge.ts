import type { AnnotationFile, AnnotationObject } from "@mahomanual/core/schema";
import { canonicalJson } from "./canonical-json.js";

function sameJson(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

/** base → remote で変わったフィールドだけを取り出す(消えたキーは undefined) */
function changedFields(
  baseObj: AnnotationObject | undefined,
  remoteObj: AnnotationObject,
): Record<string, unknown> {
  if (!baseObj) {
    return { ...remoteObj };
  }
  const patch: Record<string, unknown> = {};
  const baseRecord = baseObj as unknown as Record<string, unknown>;
  const remoteRecord = remoteObj as unknown as Record<string, unknown>;
  for (const key of new Set([...Object.keys(baseRecord), ...Object.keys(remoteRecord)])) {
    if (!sameJson(baseRecord[key], remoteRecord[key])) {
      patch[key] = structuredClone(remoteRecord[key]);
    }
  }
  return patch;
}

/**
 * 画像の追加・置換はサーバー側で注釈ファイルへ直接保存される。
 * その結果(remote)から対象画像オブジェクトとキャンバスの変更だけを、
 * 未保存の編集を含む手元(local)へ合流させる。base は手元が最後に保存した内容。
 */
export function mergeServerImageChange(
  base: AnnotationFile,
  local: AnnotationFile,
  remote: AnnotationFile,
  objectId: string,
): AnnotationFile {
  const remoteObj = remote.objects.find((obj) => obj.id === objectId);
  if (!remoteObj) {
    return local;
  }
  const localObj = local.objects.find((obj) => obj.id === objectId);
  let objects: AnnotationObject[];
  if (!localObj) {
    objects = [...local.objects, structuredClone(remoteObj)];
  } else {
    const patch = changedFields(
      base.objects.find((obj) => obj.id === objectId),
      remoteObj,
    );
    objects = local.objects.map((obj) => {
      if (obj.id !== objectId) {
        return obj;
      }
      const next = { ...obj, ...patch } as Record<string, unknown>;
      for (const key of Object.keys(next)) {
        if (next[key] === undefined) {
          delete next[key];
        }
      }
      return next as unknown as AnnotationObject;
    });
  }
  const canvas = sameJson(base.canvas, remote.canvas) ? local.canvas : structuredClone(remote.canvas);
  return { ...local, canvas, objects };
}
