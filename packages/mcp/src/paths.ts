import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isSafeName, resolveProjectRoot } from "@mahomanual/core/safe-name";

export const defaultRepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export function getProjectsDir(repoRoot: string): string {
  return join(repoRoot, "projects");
}

// MCP の project 引数は projects/ 配下のプロジェクト名(フォルダ名)だけを受け付ける。
// MCP クライアント(AI)から渡される値なので、パス指定・`..`・絶対パスは使えない(SPEC §3.1・§10)
export function resolveProjectPath(projectsDir: string, project: string): string {
  if (!isSafeName(project)) {
    throw new Error(
      `不正なプロジェクト名です。project には projects/ 配下のプロジェクト名(文字・数字・-・_ のみ)を指定してください: ${JSON.stringify(project)}`,
    );
  }
  const projectRoot = resolveProjectRoot(projectsDir, project);
  if (!existsSync(join(projectRoot, "manual.md"))) {
    throw new Error(`プロジェクトが見つかりません: ${project}`);
  }
  return projectRoot;
}
