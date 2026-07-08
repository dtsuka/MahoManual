import type { AnnotationFile, AnnotationObject } from "@mahomanual/core/schema";
import type { AnnotationTheme } from "@mahomanual/core/theme";

export interface ProjectInfo {
  name: string;
  title: string;
  pageCount: number;
  imageCount: number;
}

export interface ManualContents {
  body: string;
  annotations: string[];
  captures: string[];
}

export interface AnnotationResponse {
  annotation: AnnotationFile;
  naturalSizes: Record<string, { w: number; h: number }>;
  theme?: AnnotationTheme;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? `Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export function fetchProjects(): Promise<ProjectInfo[]> {
  return request("/api/projects");
}

export function fetchManual(project: string): Promise<ManualContents> {
  return request(`/api/projects/${encodeURIComponent(project)}/manual`);
}

export function saveManual(project: string, body: string): Promise<{ ok: boolean }> {
  return request(`/api/projects/${encodeURIComponent(project)}/manual`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
}

export function fetchAnnotation(project: string, id: string): Promise<AnnotationResponse> {
  return request(`/api/projects/${encodeURIComponent(project)}/annotations/${encodeURIComponent(id)}`);
}

export function saveAnnotation(project: string, id: string, annotation: AnnotationFile): Promise<{ annotation: AnnotationFile }> {
  return request(`/api/projects/${encodeURIComponent(project)}/annotations/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(annotation),
  });
}

export function renumberAnnotation(project: string, id: string): Promise<{ annotation: AnnotationFile; warning: string | null }> {
  return request(`/api/projects/${encodeURIComponent(project)}/annotations/${encodeURIComponent(id)}/renumber`, {
    method: "POST",
  });
}

export interface RenumberAllResponse {
  totalBadges: number;
  files: Array<{ id: string; badges: number }>;
  warning: string | null;
}

export function renumberAllAnnotations(project: string): Promise<RenumberAllResponse> {
  return request(`/api/projects/${encodeURIComponent(project)}/renumber`, {
    method: "POST",
  });
}

export function fetchPreview(
  project: string,
  markdown: string,
): Promise<{ html: string; theme?: AnnotationTheme }> {
  return request(`/api/projects/${encodeURIComponent(project)}/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ markdown }),
  });
}

export function pasteImage(
  project: string,
  id: string,
  data: string,
  width?: number,
  height?: number,
): Promise<{ id: string; annotation: AnnotationFile }> {
  return request(`/api/projects/${encodeURIComponent(project)}/images`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, data, width, height }),
  });
}

export function projectFileSrc(project: string, src: string): string {
  return `/api/projects/${encodeURIComponent(project)}/files/${src.split("/").map(encodeURIComponent).join("/")}`;
}

export function createObjectId(type: AnnotationObject["type"], objects: AnnotationObject[]): string {
  const prefix = type === "badge" ? "b" : type === "text" ? "t" : type === "frame" ? "f" : type === "line" ? "l" : "a";
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

export function rewriteFigureHtml(html: string, project: string): string {
  return html.replace(/src="(img\/[^"]+)"/g, (_match, src: string) => {
    return `src="${projectFileSrc(project, src)}"`;
  });
}

export function injectObjectIds(html: string, objects: AnnotationObject[]): string {
  const taggable = objects.filter(
    (obj): obj is Extract<AnnotationObject, { type: "badge" | "text" | "frame" }> =>
      obj.type === "badge" || obj.type === "text" || obj.type === "frame",
  );
  let index = 0;
  return html.replace(/<(span|div) class="mm-obj mm-(badge|text|frame)/g, (match, tag, kind) => {
    const obj = taggable[index];
    index += 1;
    if (!obj) {
      return match;
    }
    return `<${tag} data-mm-id="${obj.id}" class="mm-obj mm-${kind}`;
  });
}

export function subscribeProjectWatch(
  project: string,
  onEvent: (event: { type: string; path: string }) => void,
): () => void {
  const source = new EventSource(`/api/watch/${encodeURIComponent(project)}`);
  source.addEventListener("file", (event) => {
    onEvent(JSON.parse(event.data) as { type: string; path: string });
  });
  return () => source.close();
}
