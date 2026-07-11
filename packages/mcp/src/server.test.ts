import { createServer, type Server } from "node:http";
import {
  cpSync,
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
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMahoManualServer } from "./server.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const demoProject = join(repoRoot, "packages/core/tests/fixtures/projects/demo");
const fakeCmsDir = join(repoRoot, "packages/core/tests/fixtures/fake-cms");

let fakeCmsServer: Server;
let fakeCmsUrl: string;

function textContent(result: { content: Array<{ type: string; text?: string }>; isError?: boolean }): string {
  const block = result.content[0];
  return block?.type === "text" ? (block.text ?? "") : "";
}

async function connectClient(): Promise<Client> {
  const server = createMahoManualServer({ repoRoot });
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

beforeAll(async () => {
  await new Promise<void>((resolveDone) => {
    fakeCmsServer = createServer((_req, res) => {
      const html = readFileSync(join(fakeCmsDir, "index.html"), "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    });
    fakeCmsServer.listen(0, "127.0.0.1", () => {
      const address = fakeCmsServer.address();
      if (!address || typeof address === "string") {
        throw new Error("failed to start fake CMS server");
      }
      fakeCmsUrl = `http://127.0.0.1:${address.port}`;
      resolveDone();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolveDone) => fakeCmsServer.close(() => resolveDone()));
});

describe("MahoManual MCP server", () => {
  it("lists manuals, reads manual and annotation", async () => {
    const client = await connectClient();
    try {
      const list = await client.callTool({ name: "list_manuals", arguments: {} });
      expect(list.isError).not.toBe(true);
      const manuals = JSON.parse(textContent(list)) as Array<{ name: string }>;
      expect(manuals.some((item) => item.name === "example")).toBe(true);

      const manual = await client.callTool({
        name: "read_manual",
        arguments: { project: "example" },
      });
      expect(manual.isError).not.toBe(true);
      const manualBody = JSON.parse(textContent(manual)) as { body: string; annotations: string[] };
      expect(manualBody.body).toContain("#");
      expect(manualBody.annotations).toContain("1-1");

      const annotation = await client.callTool({
        name: "read_annotation",
        arguments: { project: "example", id: "1-1" },
      });
      expect(annotation.isError).not.toBe(true);
      const parsed = JSON.parse(textContent(annotation)) as { version: number };
      expect(parsed.version).toBe(1);
    } finally {
      await client.close();
    }
  });

  it("validates annotation objects and supports annotation CRUD", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "mahomanual-mcp-crud-"));
    cpSync(demoProject, projectRoot, { recursive: true });
    try {
      const client = await connectClient();
      try {
        const invalid = await client.callTool({
          name: "add_annotation",
          arguments: {
            project: projectRoot,
            id: "demo",
            object: { id: "bad", type: "line", source: "manual", points: [{ x: 1, y: 2 }] },
          },
        });
        expect(invalid.isError).toBe(true);
        expect(textContent(invalid)).toMatch(/入力エラー:/);
        expect(textContent(invalid)).toMatch(/points/);

        const added = await client.callTool({
          name: "add_annotation",
          arguments: {
            project: projectRoot,
            id: "demo",
            object: {
              id: "b-test",
              type: "badge",
              source: "manual",
              n: 9,
              at: { x: 10, y: 10 },
            },
          },
        });
        expect(added.isError).not.toBe(true);
        expect(textContent(added)).toContain("b-test");

        const updated = await client.callTool({
          name: "update_annotation",
          arguments: {
            project: projectRoot,
            id: "demo",
            objectId: "b-test",
            patch: { at: { x: 12, y: 14 } },
          },
        });
        expect(updated.isError).not.toBe(true);
        expect(textContent(updated)).toContain('"x": 12');

        const cropped = await client.callTool({
          name: "set_crop",
          arguments: {
            project: projectRoot,
            id: "demo",
            objectId: "img-main",
            crop: { x: 0, y: 0, w: 640, h: 480 },
          },
        });
        expect(cropped.isError).not.toBe(true);
        expect(textContent(cropped)).toContain('"w": 640');

        const renumbered = await client.callTool({
          name: "renumber_badges",
          arguments: { project: projectRoot, id: "demo" },
        });
        expect(renumbered.isError).not.toBe(true);
        const renumberedJson = JSON.parse(textContent(renumbered)) as {
          objects: Array<{ type: string; n?: number }>;
        };
        const badgeNumbers = renumberedJson.objects
          .filter((obj) => obj.type === "badge")
          .map((obj) => obj.n);
        expect(badgeNumbers).toEqual([1, 2]);

        const removed = await client.callTool({
          name: "remove_annotation",
          arguments: { project: projectRoot, id: "demo", objectId: "b-test" },
        });
        expect(removed.isError).not.toBe(true);
        expect(textContent(removed)).not.toContain("b-test");
      } finally {
        await client.close();
      }
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("expands canvas margin via expand_canvas (SPEC §4.5)", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "mahomanual-mcp-margin-"));
    cpSync(demoProject, projectRoot, { recursive: true });
    try {
      const client = await connectClient();
      try {
        const expanded = await client.callTool({
          name: "expand_canvas",
          arguments: { project: projectRoot, id: "demo", margin: { left: 320 } },
        });
        expect(expanded.isError).not.toBe(true);
        const result = JSON.parse(textContent(expanded)) as {
          canvas: { width: number; height: number };
          objects: Array<{
            id: string;
            rect?: { x: number; w: number };
            at?: { x: number; y: number };
          }>;
        };
        expect(result.canvas).toEqual({ width: 1600, height: 960 });
        const image = result.objects.find((obj) => obj.id === "img-main");
        expect(image?.rect?.x).toBeCloseTo(20, 10);
        expect(image?.rect?.w).toBeCloseTo(80, 10);
        const badge = result.objects.find((obj) => obj.id === "b1");
        expect(badge?.at?.x).toBeCloseTo(33.84, 10);
        expect(badge?.at?.y).toBeCloseTo(16, 10);

        const saved = JSON.parse(
          readFileSync(join(projectRoot, "annotations", "demo.json"), "utf8"),
        ) as { canvas: { width: number; height: number } };
        expect(saved.canvas).toEqual({ width: 1600, height: 960 });

        const invalid = await client.callTool({
          name: "expand_canvas",
          arguments: { project: projectRoot, id: "demo", margin: { left: -2000 } },
        });
        expect(invalid.isError).toBe(true);
        expect(textContent(invalid)).toMatch(/canvas/i);
      } finally {
        await client.close();
      }
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("builds HTML and exports PDF", async () => {
    const client = await connectClient();
    try {
      const html = await client.callTool({
        name: "build_html",
        arguments: { project: demoProject },
      });
      expect(html.isError).not.toBe(true);
      const htmlResult = JSON.parse(textContent(html)) as { htmlPath: string };
      expect(existsSync(htmlResult.htmlPath)).toBe(true);

      const pdf = await client.callTool({
        name: "export_pdf",
        arguments: { project: demoProject },
      });
      expect(pdf.isError).not.toBe(true);
      const pdfResult = JSON.parse(textContent(pdf)) as { pdfPath: string };
      expect(existsSync(pdfResult.pdfPath)).toBe(true);
      expect(readFileSync(pdfResult.pdfPath).byteLength).toBeGreaterThan(1024);
    } finally {
      await client.close();
    }
  }, 30000);

  it("runs capture recipes", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "mahomanual-mcp-capture-"));
    try {
      mkdirSync(join(projectRoot, "annotations"), { recursive: true });
      mkdirSync(join(projectRoot, "img", "raw"), { recursive: true });
      mkdirSync(join(projectRoot, "captures"), { recursive: true });
      writeFileSync(join(projectRoot, "manual.md"), "# test\n");
      writeFileSync(join(projectRoot, "project.yaml"), `title: test\nbaseUrl: ${fakeCmsUrl}\n`);
      writeFileSync(
        join(projectRoot, "captures", "demo.yaml"),
        `url: /\nviewport: { width: 1280, height: 900 }\nsteps:\n  - waitFor: "#addtag"\nscreenshot:\n  target: fullPage\noutput: demo\nannotate:\n  - type: badge\n    selector: "#tag-name"\n  - type: badge\n    selector: "#tag-slug"\n  - type: frame\n    selector: "#menu-posts .current"\n`,
      );

      const client = await connectClient();
      try {
        const capture = await client.callTool({
          name: "run_capture",
          arguments: { project: projectRoot, recipeId: "demo" },
        });
        expect(capture.isError).not.toBe(true);
        const result = JSON.parse(textContent(capture)) as {
          results: Array<{ recipeId: string; output: string }>;
        };
        expect(result.results[0]?.recipeId).toBe("demo");
        expect(existsSync(join(projectRoot, "annotations/demo.json"))).toBe(true);
      } finally {
        await client.close();
      }
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  }, 60000);
});
