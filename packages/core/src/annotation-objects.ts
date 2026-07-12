import type { AnnotationFile, AnnotationObject, Point, Rect } from "./schema.js";

export type ImageObject = Extract<AnnotationObject, { type: "image" }>;
export type MosaicObject = Extract<AnnotationObject, { type: "mosaic" }>;
export type TextObject = Extract<AnnotationObject, { type: "text" }>;
export type RectObject = Extract<AnnotationObject, { type: "frame" | "image" | "mosaic" }>;
export type LineObject = Extract<AnnotationObject, { type: "line" | "arrow" }>;
export type TaggableObject = Extract<
  AnnotationObject,
  { type: "image" | "badge" | "text" | "cursor" | "frame" | "mosaic" }
>;

const TEXT_BOX_WIDTH = 24;
const TEXT_BOX_HEIGHT = 8;

/** テキストをクリック配置したときの既定ボックス(座標はキャンバス%) */
export function textBoxRectFromAnchor(at: Point): Rect {
  return {
    x: at.x - TEXT_BOX_WIDTH / 2,
    y: at.y - TEXT_BOX_HEIGHT / 2,
    w: TEXT_BOX_WIDTH,
    h: TEXT_BOX_HEIGHT,
  };
}

/** 旧at形式も含め、テキストの編集対象となる矩形を返す */
export function textBoxRect(obj: TextObject): Rect {
  return obj.rect ?? textBoxRectFromAnchor(obj.at);
}

/** テキストボックスの矩形変更と中心アンカー同期を一度に行う */
export function setTextBoxRect(obj: TextObject, rect: Rect): TextObject {
  return {
    ...obj,
    rect,
    at: { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 },
  };
}

/** 旧形式のテキストを矩形ボックスへ読み込み時に正規化する */
export function normalizeTextBoxes(annotation: AnnotationFile): AnnotationFile {
  return {
    ...annotation,
    objects: annotation.objects.map((obj) =>
      obj.type === "text" && !obj.rect ? setTextBoxRect(obj, textBoxRect(obj)) : obj,
    ),
  };
}

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
export function isAddedImage(obj: ImageObject, annotationId: string): boolean {
  const basename = obj.src.split("/").pop() ?? "";
  const name = basename.replace(/\.[^.]+$/, "");
  return name === `${annotationId}-${obj.id}`;
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
  return !isAddedImage(obj, annotationId);
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
