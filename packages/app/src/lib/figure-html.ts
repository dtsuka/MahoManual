import type { AnnotationObject } from "@mahomanual/core/schema";
import { taggableObjectsInDisplayOrder } from "@mahomanual/core/annotation-objects";
import { projectFileSrc } from "./api.js";

export function rewriteFigureHtml(html: string, project: string): string {
  return html.replace(/src="(img\/[^"]+)"/g, (_match, src: string) => {
    return `src="${projectFileSrc(project, src)}"`;
  });
}

export function injectObjectIds(
  html: string,
  objects: AnnotationObject[],
  selectedIds: ReadonlySet<string> = new Set(),
): string {
  const taggable = taggableObjectsInDisplayOrder(objects);
  let index = 0;
  return html.replace(/<(span|div) class="mm-obj mm-(image|badge|text|cursor|frame|mosaic)/g, (match, tag, kind) => {
    const obj = taggable[index];
    index += 1;
    if (!obj) {
      return match;
    }
    const selectedClass = selectedIds.has(obj.id) ? " is-selected" : "";
    return `<${tag} data-mm-id="${obj.id}" class="mm-obj mm-${kind}${selectedClass}`;
  });
}
