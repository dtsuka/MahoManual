import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const defaultRepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export function getProjectsDir(repoRoot: string): string {
  return join(repoRoot, "projects");
}

export function resolveProjectPath(projectsDir: string, project: string): string {
  const direct = resolve(project);
  if (existsSync(join(direct, "manual.md"))) {
    return direct;
  }
  const underProjects = join(projectsDir, project);
  if (existsSync(join(underProjects, "manual.md"))) {
    return underProjects;
  }
  throw new Error(`プロジェクトが見つかりません: ${project}`);
}
