import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const cliBin = join(repoRoot, "packages/cli/bin/manual.mjs");
const fixtureProject = join(repoRoot, "packages/core/tests/fixtures/projects/demo");

function runManual(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [cliBin, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

describe("manual CLI", () => {
  it("creates SPEC §3 project structure with manual new", () => {
    const name = `cli-test-${Date.now()}`;
    const result = runManual(["new", name]);
    expect(result.status).toBe(0);

    const projectRoot = join(repoRoot, "projects", name);
    try {
      expect(existsSync(join(projectRoot, "manual.md"))).toBe(true);
      expect(existsSync(join(projectRoot, "project.yaml"))).toBe(true);
      expect(existsSync(join(projectRoot, "annotations"))).toBe(true);
      expect(existsSync(join(projectRoot, "img/raw"))).toBe(true);
      expect(existsSync(join(projectRoot, "captures"))).toBe(true);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("builds and exports pdf for fixture project with exit code 0", () => {
    const outDir = mkdtempSync(join(tmpdir(), "mahomanual-cli-build-"));
    try {
      const build = runManual(["build", fixtureProject, "-o", outDir]);
      expect(build.status).toBe(0);
      expect(existsSync(join(outDir, "manual.html"))).toBe(true);

      const pdf = runManual(["pdf", fixtureProject, "-o", join(outDir, "manual.pdf")]);
      expect(pdf.status).toBe(0);
      expect(existsSync(join(outDir, "manual.pdf"))).toBe(true);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 30000);

  it("returns exit code 1 for invalid project path", () => {
    const result = runManual(["build", "__missing_project__"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/見つかりません/);
  });
});
