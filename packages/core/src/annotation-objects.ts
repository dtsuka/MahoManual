import type { AnnotationFile, AnnotationObject } from "./schema.js";

export type ImageObject = Extract<AnnotationObject, { type: "image" }>;
export type MosaicObject = Extract<AnnotationObject, { type: "mosaic" }>;
export type RectObject = Extract<AnnotationObject, { type: "frame" | "image" | "mosaic" }>;
export type LineObject = Extract<AnnotationObject, { type: "line" | "arrow" }>;
export type TaggableObject = Extract<
  AnnotationObject,
  { type: "image" | "badge" | "text" | "cursor" | "frame" | "mosaic" }
>;

export function collectImageSources(
  annotation: Pick<AnnotationFile, "objects">,
): string[] {
  return annotation.objects
    .filter((obj): obj is ImageObject => obj.type === "image")
    .map((obj) => obj.src);
}

export function mosaicsForImage(
  objects: readonly AnnotationObject[],
  imageId: string,
): MosaicObject[] {
  return objects.filter(
    (obj): obj is MosaicObject => obj.type === "mosaic" && obj.targetImageId === imageId,
  );
}

/** DOM/data-mm-id 注入順。各 image の直後に紐づく mosaic を差し込む */
export function taggableObjectsInDisplayOrder(
  objects: readonly AnnotationObject[],
): TaggableObject[] {
  const result: TaggableObject[] = [];
  for (const obj of objects) {
    if (obj.type === "mosaic" || obj.type === "line" || obj.type === "arrow") {
      continue;
    }
    result.push(obj);
    if (obj.type === "image") {
      result.push(...mosaicsForImage(objects, obj.id));
    }
  }
  return result;
}

export function isRectObject(obj: AnnotationObject): obj is RectObject {
  return obj.type === "frame" || obj.type === "image" || obj.type === "mosaic";
}

export function isLineObject(obj: AnnotationObject): obj is LineObject {
  return obj.type === "line" || obj.type === "arrow";
}

/** 注釈への追加画像(配置調整用)。src は img/raw/{annotationId}-{objectId}.png 形式 */
export function isAddedImageSrc(src: string, annotationId: string): boolean {
  const basename = src.split("/").pop() ?? "";
  const name = basename.replace(/\.[^.]+$/, "");
  const prefix = `${annotationId}-`;
  return name.startsWith(prefix) && name.length > prefix.length;
}

/** ベース画像・レシピ画像。追加画像以外の image は既定でロック対象 */
export function isBaseImage(obj: ImageObject, annotationId: string): boolean {
  if (obj.source === "recipe") {
    return true;
  }
  if (obj.id === "img-main") {
    return true;
  }
  if (obj.src === `img/raw/${annotationId}.png`) {
    return true;
  }
  return !isAddedImageSrc(obj.src, annotationId);
}

export function applyDefaultImageLocks(
  annotation: AnnotationFile,
  annotationId: string,
): AnnotationFile {
  return {
    ...annotation,
    objects: annotation.objects.map((obj) => {
      if (obj.type !== "image" || obj.locked !== undefined) {
        return obj;
      }
      return {
        ...obj,
        locked: isBaseImage(obj, annotationId),
      };
    }),
  };
}

export function isEditable(obj: AnnotationObject): boolean {
  return !obj.locked;
}
