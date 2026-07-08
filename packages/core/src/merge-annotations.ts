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

  return {
    version: 1,
    canvas: captured.canvas,
    objects: [...kept, ...incoming],
  };
}
