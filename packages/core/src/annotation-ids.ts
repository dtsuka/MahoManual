import type { AnnotationObject } from "./schema.js";

export function createObjectId(type: AnnotationObject["type"], objects: AnnotationObject[]): string {
  const prefix =
    type === "badge"
      ? "b"
      : type === "text"
        ? "t"
        : type === "cursor"
          ? "c"
          : type === "frame"
            ? "f"
            : type === "line"
              ? "l"
            : type === "image"
              ? "img"
              : type === "mosaic"
                ? "m"
                : "a";
  let index = objects.filter((obj) => obj.type === type).length + 1;
  let candidate = `${prefix}${index}`;
  const ids = new Set(objects.map((obj) => obj.id));
  while (ids.has(candidate)) {
    index += 1;
    candidate = `${prefix}${index}`;
  }
  return candidate;
}

export function nextBadgeNumber(objects: AnnotationObject[]): number {
  const numbers = objects
    .filter((obj): obj is Extract<AnnotationObject, { type: "badge" }> => obj.type === "badge")
    .map((obj) => obj.n);
  return numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
}
