import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "../..");
const demoFixture = join(repoRoot, "packages/core/tests/fixtures/projects/demo");

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "mahomanual-mcp-stdio-"));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe("MahoManual MCP server over stdio", () => {
  it("starts from the package bin entry and answers initialize and tool calls", async () => {
    const pkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
      bin: Record<string, string>;
    };
    const binEntry = resolve(packageRoot, pkg.bin["mahomanual-mcp"] ?? "");
    const projectsDir = join(workDir, "projects");
    mkdirSync(projectsDir);
    cpSync(demoFixture, join(projectsDir, "demo"), {
      recursive: true,
      filter: (src) => !src.startsWith(join(demoFixture, "dist")),
    });

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [binEntry],
      // 実行時のフォルダに依存せず起動できること
      cwd: workDir,
      env: { MAHOMANUAL_PROJECTS_DIR: projectsDir },
      stderr: "pipe",
    });
    let stderr = "";
    transport.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    const client = new Client({ name: "stdio-test", version: "0.0.0" });
    try {
      await client.connect(transport);
      expect(client.getServerVersion()?.name).toBe("MahoManual");

      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toContain("expand_canvas");

      const list = await client.callTool({ name: "list_manuals", arguments: {} });
      expect(list.isError, stderr).not.toBe(true);
      const block = (list.content as Array<{ type: string; text?: string }>)[0];
      const manuals = JSON.parse(block?.text ?? "[]") as Array<{ name: string }>;
      expect(manuals.map((item) => item.name)).toEqual(["demo"]);
    } finally {
      await client.close();
    }
  }, 10000);
});
