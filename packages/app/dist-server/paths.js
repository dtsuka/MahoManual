import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
export const repoRoot = join(packageRoot, "../..");
export const projectsDir = join(repoRoot, "projects");
export function projectRoot(name) {
    return join(projectsDir, name);
}
export function projectFileUrl(project, relativePath) {
    return `/api/projects/${encodeURIComponent(project)}/files/${relativePath.split("/").map(encodeURIComponent).join("/")}`;
}
