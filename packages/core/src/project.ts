import type { AnnotationFile, AnnotationObject } from "./schema.js";

export function renumberBadges(annotation: AnnotationFile): AnnotationFile {
  let counter = 1;
  const objects = annotation.objects.map((obj): AnnotationObject => {
    if (obj.type !== "badge") {
      return obj;
    }
    return { ...obj, n: counter++ };
  });
  return { ...annotation, objects };
}
