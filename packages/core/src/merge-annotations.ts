import { expandCanvas, remapObjects } from "./expand-canvas.js";
import type { AnnotationFile, AnnotationObject } from "./schema.js";

type ImageObject = Extract<AnnotationObject, { type: "image" }>;

function belongsToRecipe(obj: AnnotationObject, recipeId: string): boolean {
  return obj.source === "recipe" && obj.recipeRef?.startsWith(`${recipeId}#`) === true;
}

function findRecipeImage(annotation: AnnotationFile, recipeId: string): ImageObject | undefined {
  return annotation.objects.find(
    (obj): obj is ImageObject => obj.type === "image" && obj.source === "recipe" && obj.recipeRef === `${recipeId}#image`,
  );
}

// 画像の rect(%)を canvas 上の px と、canvas 端までの余白(px)へ変換する
function imageLayout(annotation: AnnotationFile, image: ImageObject) {
  const { width, height } = annotation.canvas;
  const x = (image.rect.x / 100) * width;
  const y = (image.rect.y / 100) * height;
  const w = (image.rect.w / 100) * width;
  const h = (image.rect.h / 100) * height;
  return {
    x,
    y,
    margin: { top: y, left: x, right: width - x - w, bottom: height - y - h },
  };
}

export function mergeAnnotations(
  existing: AnnotationFile | null,
  captured: AnnotationFile,
  recipeId: string,
): AnnotationFile {
  if (!existing) {
    return captured;
  }

  let base = captured;
  let kept = existing.objects.filter((obj) => !belongsToRecipe(obj, recipeId));

  // SPEC §4.5 / §9.4: GUI などで追加したキャンバス余白を再撮影後も保つ。
  // 前回の撮影画像のまわりの余白(px)が今回の撮影結果より大きい辺は、その差だけ余白を足す。
  // 残すオブジェクトは「撮影画像の左上からの位置(px)」を保つように%座標を計算し直す
  const oldImage = findRecipeImage(existing, recipeId);
  const capturedImage = findRecipeImage(captured, recipeId);
  if (oldImage && capturedImage) {
    const oldLayout = imageLayout(existing, oldImage);
    const capturedLayout = imageLayout(captured, capturedImage);
    const extra = Object.fromEntries(
      (["top", "right", "bottom", "left"] as const).map((side) => [
        side,
        Math.max(0, Math.round(oldLayout.margin[side] - capturedLayout.margin[side])),
      ]),
    );
    base = expandCanvas(captured, extra);
    const newImage = findRecipeImage(base, recipeId)!;
    const newLayout = imageLayout(base, newImage);
    kept = remapObjects(kept, existing.canvas, base.canvas, {
      x: newLayout.x - oldLayout.x,
      y: newLayout.y - oldLayout.y,
    });
  }

  const incoming = base.objects.filter((obj) => belongsToRecipe(obj, recipeId));

  // 配列順 = 描画順(後が上)のため、撮影由来の image は必ず先頭(最下層)に置く。
  // 単純に kept の後ろへ連結すると、全面 image が manual 注釈を覆い隠してしまう
  const incomingImages = incoming.filter((obj) => obj.type === "image");
  const incomingOverlays = incoming.filter((obj) => obj.type !== "image");

  return {
    version: 1,
    canvas: base.canvas,
    objects: [...incomingImages, ...kept, ...incomingOverlays],
  };
}
