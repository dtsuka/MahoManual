import { createServer, type Server } from "node:http";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const cliBin = join(repoRoot, "packages/cli/bin/manual.mjs");
const fakeCmsDir = join(repoRoot, "packages/core/tests/fixtures/fake-cms");

let server: Server;
let baseUrl: string;

async function runManual(args: string[]): Promise<{ status: number | null; stderr: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [cliBin, ...args], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (status) => {
      resolvePromise({ status, stderr });
    });
  });
}

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = createServer((_req, res) => {
      const html = readFileSync(join(fakeCmsDir, "index.html"), "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("failed to start fake CMS server");
      }
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("manual capture", () => {
  it("runs capture for a recipe against fake CMS", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "mahomanual-capture-cli-"));
    try {
      mkdirSync(join(projectRoot, "annotations"), { recursive: true });
      mkdirSync(join(projectRoot, "img", "raw"), { recursive: true });
      mkdirSync(join(projectRoot, "captures"), { recursive: true });
      writeFileSync(join(projectRoot, "manual.md"), "# test\n");
      writeFileSync(join(projectRoot, "project.yaml"), `title: test\nbaseUrl: ${baseUrl}\n`);
      writeFileSync(
        join(projectRoot, "captures", "demo.yaml"),
        `url: /\nviewport: { width: 1280, height: 900 }\nsteps:\n  - waitFor: "#addtag"\nscreenshot:\n  target: fullPage\noutput: demo\nannotate:\n  - type: badge\n    selector: "#tag-name"\n  - type: badge\n    selector: "#tag-slug"\n  - type: frame\n    selector: "#menu-posts .current"\n`,
      );

      const result = await runManual(["capture", projectRoot, "demo"]);
      expect(result.status).toBe(0);
      expect(existsSync(join(projectRoot, "img/raw/demo.png"))).toBe(true);
      expect(existsSync(join(projectRoot, "annotations/demo.json"))).toBe(true);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  }, 60000);

  it("runs capture --all for multiple recipes", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "mahomanual-capture-all-"));
    try {
      mkdirSync(join(projectRoot, "captures"), { recursive: true });
      mkdirSync(join(projectRoot, "annotations"), { recursive: true });
      mkdirSync(join(projectRoot, "img", "raw"), { recursive: true });
      writeFileSync(join(projectRoot, "manual.md"), "# test\n");
      writeFileSync(join(projectRoot, "project.yaml"), `title: test\nbaseUrl: ${baseUrl}\n`);
      const recipe = `url: /\nscreenshot:\n  target: fullPage\noutput: OUT\n`;
      writeFileSync(join(projectRoot, "captures", "a.yaml"), recipe.replace("OUT", "a"));
      writeFileSync(join(projectRoot, "captures", "b.yaml"), recipe.replace("OUT", "b"));

      const result = await runManual(["capture", projectRoot, "--all"]);
      expect(result.status).toBe(0);
      expect(existsSync(join(projectRoot, "annotations/a.json"))).toBe(true);
      expect(existsSync(join(projectRoot, "annotations/b.json"))).toBe(true);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  }, 60000);
});
