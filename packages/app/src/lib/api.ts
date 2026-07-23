import type { AnnotationFile } from "@mahomanual/core/schema";
import type { AnnotationTheme } from "@mahomanual/core/theme";
import type { AnnotationDefaults } from "@mahomanual/core/annotation-defaults";
import type {
  ManualContents,
  ProjectInfo,
  ProjectOutputFilenames,
} from "@mahomanual/core/project";

export type { ManualContents, ProjectInfo, ProjectOutputFilenames };

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

export function createProject(id: string, title: string): Promise<{ id: string; title: string }> {
  return request("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, title }),
  });
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

export function fetchProjectOutput(project: string): Promise<ProjectOutputFilenames> {
  return request(`/api/projects/${encodeURIComponent(project)}/output`);
}

export function saveProjectOutput(
  project: string,
  filenames: ProjectOutputFilenames,
): Promise<ProjectOutputFilenames> {
  return request(`/api/projects/${encodeURIComponent(project)}/output`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(filenames),
  });
}

export function fetchProjectTheme(project: string): Promise<{ theme: AnnotationTheme; defaults?: AnnotationDefaults }> {
  return request(`/api/projects/${encodeURIComponent(project)}/theme`);
}

// 注釈の既定テーマを全置換する。キー省略は「既定値に戻す」
export function saveProjectTheme(
  project: string,
  theme: AnnotationTheme,
  defaults?: AnnotationDefaults,
): Promise<{ theme: AnnotationTheme; defaults?: AnnotationDefaults }> {
  return request(`/api/projects/${encodeURIComponent(project)}/theme`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(defaults === undefined ? theme : { ...theme, defaults }),
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

export function renameAnnotation(
  project: string,
  currentId: string,
  nextId: string,
): Promise<{ id: string; annotation: AnnotationFile }> {
  return request(
    `/api/projects/${encodeURIComponent(project)}/annotations/${encodeURIComponent(currentId)}/id`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: nextId }),
    },
  );
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

export function addAnnotationImage(
  project: string,
  annotationId: string,
  objectId: string,
  data: string,
  width: number,
  height: number,
): Promise<AnnotationResponse> {
  return request(
    `/api/projects/${encodeURIComponent(project)}/annotations/${encodeURIComponent(annotationId)}/images`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ objectId, data, width, height }),
    },
  );
}

export function replaceAnnotationImage(
  project: string,
  annotationId: string,
  objectId: string,
  data: string,
  width: number,
  height: number,
): Promise<AnnotationResponse> {
  return request(
    `/api/projects/${encodeURIComponent(project)}/annotations/${encodeURIComponent(annotationId)}/images/${encodeURIComponent(objectId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data, width, height }),
    },
  );
}

export function projectFileSrc(project: string, src: string): string {
  return `/api/projects/${encodeURIComponent(project)}/files/${src.split("/").map(encodeURIComponent).join("/")}`;
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
