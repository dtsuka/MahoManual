import type { AnnotationFile, AnnotationObject } from "./schema.js";

function belongsToRecipe(obj: AnnotationObject, recipeId: string): boolean {
  return obj.source === "recipe" && obj.recipeRef?.startsWith(`${recipeId}#`) === true;
}

export function mergeAnnotations(
  existing: AnnotationFile | null,
  captured: AnnotationFile,
  recipeId: string,
): AnnotationFile {
  if (!existing) {
    return captured;
  }

  const kept = existing.objects.filter((obj) => !belongsToRecipe(obj, recipeId));
  const incoming = captured.objects.filter((obj) => belongsToRecipe(obj, recipeId));

  // 配列順 = 描画順(後が上)のため、撮影由来の image は必ず先頭(最下層)に置く。
  // 単純に kept の後ろへ連結すると、全面 image が manual 注釈を覆い隠してしまう
  const incomingImages = incoming.filter((obj) => obj.type === "image");
  const incomingOverlays = incoming.filter((obj) => obj.type !== "image");

  return {
    version: 1,
    canvas: captured.canvas,
    objects: [...incomingImages, ...kept, ...incomingOverlays],
  };
}
