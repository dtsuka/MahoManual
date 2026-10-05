import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renumberBadgesFile } from "@mahomanual/core/project";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const cliBin = join(repoRoot, "packages/cli/bin/manual.mjs");
const fixtureProject = join(repoRoot, "packages/core/tests/fixtures/projects/demo");

let workDir: string;
let projectsDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "mahomanual-cli-"));
  projectsDir = join(workDir, "projects");
  mkdirSync(projectsDir);
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

// テストはリポジトリの projects/ に書き込まないよう、常に MAHOMANUAL_PROJECTS_DIR を一時フォルダに向ける
function runManual(
  args: string[],
  options: { cwd?: string } = {},
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [cliBin, ...args], {
    cwd: options.cwd ?? workDir,
    encoding: "utf8",
    env: { ...process.env, MAHOMANUAL_PROJECTS_DIR: projectsDir },
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function copyFixture(dest: string): string {
  cpSync(fixtureProject, dest, {
    recursive: true,
    filter: (src) => !src.startsWith(join(fixtureProject, "dist")),
  });
  return dest;
}

describe("manual CLI", () => {
  it("creates SPEC §3 project structure with manual new under MAHOMANUAL_PROJECTS_DIR", () => {
    const name = `cli-test-${Date.now()}`;
    const repoProject = join(repoRoot, "projects", name);
    try {
      const result = runManual(["new", name]);
      expect(result.status).toBe(0);

      const projectRoot = join(projectsDir, name);
      expect(existsSync(join(projectRoot, "manual.md"))).toBe(true);
      expect(existsSync(join(projectRoot, "project.yaml"))).toBe(true);
      expect(existsSync(join(projectRoot, "annotations"))).toBe(true);
      expect(existsSync(join(projectRoot, "img/raw"))).toBe(true);
      expect(existsSync(join(projectRoot, "captures"))).toBe(true);
      expect(existsSync(repoProject)).toBe(false);
    } finally {
      rmSync(repoProject, { recursive: true, force: true });
    }
  }, 5000);

  it("resolves a project name under MAHOMANUAL_PROJECTS_DIR", () => {
    copyFixture(join(projectsDir, "demo"));
    const outDir = join(workDir, "out");
    const build = runManual(["build", "demo", "-o", outDir]);
    expect(build.status).toBe(0);
    expect(existsSync(join(outDir, "manual.html"))).toBe(true);
  }, 5000);

  it("builds and exports pdf for fixture project with exit code 0", () => {
    const projectRoot = copyFixture(join(workDir, "demo"));
    const outDir = join(workDir, "out");
    const build = runManual(["build", projectRoot, "-o", outDir]);
    expect(build.status).toBe(0);
    expect(existsSync(join(outDir, "manual.html"))).toBe(true);

    const pdf = runManual(["pdf", projectRoot, "-o", join(outDir, "manual.pdf")]);
    expect(pdf.status).toBe(0);
    expect(existsSync(join(outDir, "manual.pdf"))).toBe(true);
  }, 15000);

  it("resolves relative project and output paths against the caller's working directory", () => {
    copyFixture(join(workDir, "rel-project"));
    const build = runManual(["build", "rel-project", "-o", "rel-out"]);
    expect(build.status).toBe(0);
    expect(existsSync(join(workDir, "rel-out", "manual.html"))).toBe(true);

    const pdf = runManual(["pdf", "./rel-project", "-o", "rel-out/relative.pdf"]);
    expect(pdf.status).toBe(0);
    expect(existsSync(join(workDir, "rel-out", "relative.pdf"))).toBe(true);
  }, 15000);

  it("manual pdf -o does not change other files in the output folder", () => {
    const projectRoot = copyFixture(join(workDir, "demo"));
    const outDir = join(workDir, "delivery");
    mkdirSync(join(outDir, "img"), { recursive: true });
    writeFileSync(join(outDir, "manual.html"), "KEEP-HTML");
    writeFileSync(join(outDir, "img", "keep.png"), "KEEP-IMG");
    writeFileSync(join(outDir, "notes.txt"), "KEEP-NOTES");

    const pdf = runManual(["pdf", projectRoot, "-o", join(outDir, "manual.pdf")]);
    expect(pdf.status).toBe(0);
    expect(readFileSync(join(outDir, "manual.pdf")).byteLength).toBeGreaterThan(1024);
    expect(readFileSync(join(outDir, "manual.html"), "utf8")).toBe("KEEP-HTML");
    expect(readFileSync(join(outDir, "img", "keep.png"), "utf8")).toBe("KEEP-IMG");
    expect(readFileSync(join(outDir, "notes.txt"), "utf8")).toBe("KEEP-NOTES");
    expect(existsSync(join(outDir, "img", "cropped"))).toBe(false);
  }, 15000);

  it("manual renumber writes the same result as core renumberBadgesFile and prints a summary", () => {
    const cliProject = copyFixture(join(workDir, "cli-copy"));
    const coreProject = copyFixture(join(workDir, "core-copy"));
    for (const root of [cliProject, coreProject]) {
      const path = join(root, "annotations", "demo.json");
      const annotation = JSON.parse(readFileSync(path, "utf8")) as {
        objects: Array<Record<string, unknown>>;
      };
      annotation.objects.push(
        { id: "b2", type: "badge", source: "manual", n: 7, at: { x: 40, y: 40 } },
        { id: "b3", type: "badge", source: "manual", n: 3, at: { x: 60, y: 60 } },
      );
      writeFileSync(path, JSON.stringify(annotation));
    }

    const result = runManual(["renumber", cliProject, "demo"]);
    expect(result.status).toBe(0);
    renumberBadgesFile(coreProject, "demo");

    expect(readFileSync(join(cliProject, "annotations", "demo.json"), "utf8")).toBe(
      readFileSync(join(coreProject, "annotations", "demo.json"), "utf8"),
    );
    expect(result.stdout).toMatch(/demo/);
    expect(result.stdout).toMatch(/3/);
  }, 5000);

  it("manual renumber rejects an annotation id that points outside annotations/", () => {
    const projectRoot = copyFixture(join(workDir, "demo"));
    mkdirSync(join(workDir, "victim"));
    const victim = join(workDir, "victim", "secret.json");
    const original = readFileSync(join(projectRoot, "annotations", "demo.json"), "utf8");
    writeFileSync(victim, original);

    const result = runManual(["renumber", projectRoot, "../../victim/secret"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/不正な注釈ID/);
    expect(readFileSync(victim, "utf8")).toBe(original);
  }, 5000);

  it("manual capture reports an error when both <recipeId> and --all are given", () => {
    const projectRoot = copyFixture(join(workDir, "demo"));
    const result = runManual(["capture", projectRoot, "demo", "--all"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/--all/);
    expect(result.stderr).toMatch(/recipeId|レシピID/);
  }, 5000);

  it("returns exit code 1 for invalid project path", () => {
    const result = runManual(["build", "__missing_project__"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/見つかりません/);
  }, 5000);
});
