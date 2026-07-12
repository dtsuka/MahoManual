import type { AnnotationObject } from "@mahomanual/core/schema";
import { extractObjectStyle, type ObjectStylePatch } from "@mahomanual/core/annotation-defaults";

const PREFIX = "mahomanual:recent-style";

export function recentStyleKey(project: string, type: AnnotationObject["type"]): string {
  return `${PREFIX}:${project}:${type}`;
}

export function loadRecentStyle(project: string, type: AnnotationObject["type"]): ObjectStylePatch | null {
  if (typeof localStorage === "undefined") {
    return null;
  }
  const raw = localStorage.getItem(recentStyleKey(project, type));
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as ObjectStylePatch;
  } catch {
    return null;
  }
}

export function saveRecentStyle(project: string, obj: AnnotationObject): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(recentStyleKey(project, obj.type), JSON.stringify(extractObjectStyle(obj)));
}
