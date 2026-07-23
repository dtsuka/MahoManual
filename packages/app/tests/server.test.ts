import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../server/app.js";
import { closeAllWatchers } from "../server/watch.js";
import { projectsDir, repoRoot } from "../server/paths.js";

const app = createApp();
const testProject = "app-test";
const testProjectRoot = join(projectsDir, testProject);

function setupTestProject() {
  mkdirSync(join(testProjectRoot, "annotations"), { recursive: true });
  mkdirSync(join(testProjectRoot, "img", "raw"), { recursive: true });
  writeFileSync(
    join(testProjectRoot, "manual.md"),
    "# Test Manual\n\n## Section\n\n```annotated-image\nsrc: test-1\n```\n",
    "utf8",
  );
  const exampleImage = join(repoRoot, "packages/core/tests/fixtures/projects/demo/img/demo.png");
  copyFileSync(exampleImage, join(testProjectRoot, "img/raw/test-1.png"));
  copyFileSync(exampleImage, join(testProjectRoot, "img/test-1.png"));
  writeFileSync(
    join(testProjectRoot, "annotations/test-1.json"),
    JSON.stringify(
      {
        version: 1,
        canvas: { width: 800, height: 600 },
        objects: [
          {
            id: "img-main",
            type: "image",
            source: "manual",
            src: "img/raw/test-1.png",
            rect: { x: 0, y: 0, w: 100, h: 100 },
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );
}

setupTestProject();

describe("Hono API", () => {
  afterAll(async () => {
    await closeAllWatchers();
    // テスト用プロジェクトをリポジトリに残さない
    rmSync(testProjectRoot, { recursive: true, force: true });
  });

  it("GET /api/projects lists manuals", async () => {
    const response = await app.request("/api/projects");
    expect(response.status).toBe(200);
    const projects = (await response.json()) as Array<{ name: string }>;
    expect(projects.some((project) => project.name === testProject)).toBe(true);
  });

  it("POST /api/projects creates a new project and rejects duplicate ids", async () => {
    const id = "app-created-project";
    const root = join(projectsDir, id);
    try {
      const response = await app.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, title: "画面から作成" }),
      });
      expect(response.status).toBe(201);
      expect(existsSync(join(root, "manual.md"))).toBe(true);
      expect(readFileSync(join(root, "project.yaml"), "utf8")).toContain("画面から作成");

      const duplicate = await app.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, title: "duplicate" }),
      });
      expect(duplicate.status).toBe(409);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("GET /api/projects/:project/export.html downloads a single HTML file", async () => {
    const response = await app.request(`/api/projects/${testProject}/export.html`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("content-disposition")).toContain(
      `filename="${testProject}.html"`,
    );
    const html = await response.text();
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("data:image/webp;base64,");
  });

  it("GET/PUT /api/projects/:project/output manages export filenames", async () => {
    writeFileSync(join(testProjectRoot, "project.yaml"), "title: 出力設定\n", "utf8");

    const initial = await app.request(`/api/projects/${testProject}/output`);
    expect(initial.status).toBe(200);
    expect(await initial.json()).toEqual({
      html: `${testProject}.html`,
      pdf: `${testProject}.pdf`,
    });

    const updated = await app.request(`/api/projects/${testProject}/output`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html: "納品版.html", pdf: "納品版.pdf" }),
    });
    expect(updated.status).toBe(200);
    expect(await updated.json()).toEqual({ html: "納品版.html", pdf: "納品版.pdf" });
    expect(readFileSync(join(testProjectRoot, "project.yaml"), "utf8")).toContain("納品版.html");

    const invalid = await app.request(`/api/projects/${testProject}/output`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html: "../manual.html", pdf: "manual.pdf" }),
    });
    expect(invalid.status).toBe(400);
  });

  it("GET/PUT /api/projects/:project/title manages display title", async () => {
    writeFileSync(join(testProjectRoot, "project.yaml"), "title: 元のタイトル\n", "utf8");

    const initial = await app.request(`/api/projects/${testProject}/title`);
    expect(initial.status).toBe(200);
    expect(await initial.json()).toEqual({ name: testProject, title: "元のタイトル" });

    const updated = await app.request(`/api/projects/${testProject}/title`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "  新しいタイトル\n " }),
    });
    expect(updated.status).toBe(200);
    expect(await updated.json()).toEqual({ name: testProject, title: "新しいタイトル" });
    expect(readFileSync(join(testProjectRoot, "project.yaml"), "utf8")).toContain("新しいタイトル");

    const empty = await app.request(`/api/projects/${testProject}/title`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "   " }),
    });
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual({ name: testProject, title: testProject });

    const invalid = await app.request(`/api/projects/${testProject}/title`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: 123 }),
    });
    expect(invalid.status).toBe(400);

    const missing = await app.request("/api/projects/no-such-project/title");
    expect(missing.status).toBe(404);
  });

  it("uses configured filenames in HTML/PDF download headers", async () => {
    const before = readFileSync(join(testProjectRoot, "project.yaml"), "utf8");
    try {
      writeFileSync(
        join(testProjectRoot, "project.yaml"),
        'title: t\noutput:\n  html: "delivery.html"\n  pdf: "delivery.pdf"\n',
        "utf8",
      );
      const htmlResponse = await app.request(`/api/projects/${testProject}/export.html`);
      expect(htmlResponse.headers.get("content-disposition")).toContain('filename="delivery.html"');

      const pdfResponse = await app.request(`/api/projects/${testProject}/export.pdf`);
      expect(pdfResponse.headers.get("content-disposition")).toContain('filename="delivery.pdf"');
    } finally {
      writeFileSync(join(testProjectRoot, "project.yaml"), before, "utf8");
    }
  }, 10_000);

  it(
    "GET /api/projects/:project/export.pdf downloads a PDF",
    async () => {
      const response = await app.request(`/api/projects/${testProject}/export.pdf`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/pdf");
      expect(response.headers.get("content-disposition")).toContain(
        `filename="${testProject}.pdf"`,
      );
      const bytes = Buffer.from(await response.arrayBuffer());
      expect(bytes.subarray(0, 4).toString("ascii")).toBe("%PDF");
    },
    10_000,
  );

  it("GET /api/projects/:project/annotations/:id returns annotation", async () => {
    const response = await app.request(`/api/projects/${testProject}/annotations/test-1`);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      annotation: {
        version: number;
        objects: Array<{ id: string; locked?: boolean }>;
      };
    };
    expect(payload.annotation.version).toBe(1);
    expect(payload.annotation.objects[0]).toMatchObject({ id: "img-main", locked: true });
  });

  it(
    "GET /api/projects/:project/annotations/:id/image.png downloads a composed PNG",
    async () => {
      const response = await app.request(
        `/api/projects/${testProject}/annotations/test-1/image.png`,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("image/png");
      expect(response.headers.get("content-disposition")).toContain('filename="test-1.png"');
      const bytes = Buffer.from(await response.arrayBuffer());
      expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    },
    10_000,
  );

  it("GET /api/projects/:project/annotations/:id includes project annotation theme", async () => {
    writeFileSync(
      join(testProjectRoot, "project.yaml"),
      'title: t\nannotation:\n  color: "#336699"\n  fontSize: 16\n',
      "utf8",
    );
    const response = await app.request(`/api/projects/${testProject}/annotations/test-1`);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { theme?: { color?: string; fontSize?: number } };
    expect(payload.theme).toEqual({ color: "#336699", fontSize: 16 });
  });

  it("GET /api/projects/:project/theme returns the current annotation theme", async () => {
    writeFileSync(
      join(testProjectRoot, "project.yaml"),
      'title: t\nannotation:\n  color: "#336699"\n  fontSize: 16\n',
      "utf8",
    );
    const response = await app.request(`/api/projects/${testProject}/theme`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ theme: { color: "#336699", fontSize: 16 }, defaults: {} });

    const missing = await app.request("/api/projects/no-such-project/theme");
    expect(missing.status).toBe(404);
  });

  it("PUT /api/projects/:project/theme updates project.yaml", async () => {
    writeFileSync(join(testProjectRoot, "project.yaml"), "title: テーマ更新\n", "utf8");
    const response = await app.request(`/api/projects/${testProject}/theme`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color: "#ff6600", fontSize: 18 }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ theme: { color: "#ff6600", fontSize: 18 }, defaults: {} });
    const yaml = readFileSync(join(testProjectRoot, "project.yaml"), "utf8");
    expect(yaml).toContain("テーマ更新");
    expect(yaml).toContain("#ff6600");

    // キー省略で既定値に戻す
    const cleared = await app.request(`/api/projects/${testProject}/theme`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(cleared.status).toBe(200);
    expect(await cleared.json()).toEqual({ theme: {}, defaults: {} });
    expect(readFileSync(join(testProjectRoot, "project.yaml"), "utf8")).not.toContain("annotation");
  });

  it("PUT /api/projects/:project/theme rejects invalid values", async () => {
    writeFileSync(join(testProjectRoot, "project.yaml"), "title: t\n", "utf8");
    for (const body of [
      { color: "pink" },
      { color: 123 },
      { fontSize: -1 },
      { fontSize: "big" },
    ]) {
      const response = await app.request(`/api/projects/${testProject}/theme`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(400);
    }
    expect(readFileSync(join(testProjectRoot, "project.yaml"), "utf8")).toBe("title: t\n");
  });

  it("PUT /api/projects/:project/annotations/:id validates with zod", async () => {
    const invalid = { version: 2, canvas: { width: 100, height: 100 }, objects: [] };
    const response = await app.request(`/api/projects/${testProject}/annotations/test-1`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(invalid),
    });
    expect(response.status).toBe(400);
  });

  it("PUT /api/projects/:project/annotations/:id saves valid annotation", async () => {
    const current = JSON.parse(
      readFileSync(join(testProjectRoot, "annotations/test-1.json"), "utf8"),
    ) as { objects: Array<{ id: string; type: string; source: string; n?: number; at?: { x: number; y: number } }> };
    const updated = {
      ...current,
      objects: [
        ...current.objects,
        { id: "b-test", type: "badge", source: "manual", n: 1, at: { x: 10, y: 10 } },
      ],
    };
    const response = await app.request(`/api/projects/${testProject}/annotations/test-1`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    expect(response.status).toBe(200);
    const saved = JSON.parse(readFileSync(join(testProjectRoot, "annotations/test-1.json"), "utf8"));
    expect(saved.objects.some((obj: { id: string }) => obj.id === "b-test")).toBe(true);
  });

  it("POST /api/projects/:project/images imports base64 image", async () => {
    const pngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const response = await app.request(`/api/projects/${testProject}/images`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "pasted-1",
        data: `data:image/png;base64,${pngBase64}`,
        width: 10,
        height: 10,
      }),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { id: string };
    expect(payload.id).toBe("pasted-1");
    expect(readFileSync(join(testProjectRoot, "img/raw/pasted-1.png")).byteLength).toBeGreaterThan(0);
  });

  it("POST /api/projects/:project/images rejects an existing annotation id", async () => {
    const pngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const beforeJson = readFileSync(join(testProjectRoot, "annotations/test-1.json"), "utf8");
    const response = await app.request(`/api/projects/${testProject}/images`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "test-1",
        data: `data:image/png;base64,${pngBase64}`,
        width: 10,
        height: 10,
      }),
    });
    expect(response.status).toBe(409);
    // 既存の注釈 JSON が雛形で上書きされていないこと
    expect(readFileSync(join(testProjectRoot, "annotations/test-1.json"), "utf8")).toBe(beforeJson);
  });

  it("POST /api/projects/:project/annotations/:id/images adds another image", async () => {
    const pngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const before = JSON.parse(
      readFileSync(join(testProjectRoot, "annotations/test-1.json"), "utf8"),
    ) as { canvas: { width: number; height: number }; objects: Array<{ id: string }> };
    const response = await app.request(
      `/api/projects/${testProject}/annotations/test-1/images`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objectId: "img-extra",
          data: `data:image/png;base64,${pngBase64}`,
          width: 400,
          height: 200,
        }),
      },
    );
    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      annotation: {
        canvas: { width: number; height: number };
        objects: Array<{
          id: string;
          type: string;
          src?: string;
          locked?: boolean;
          rect?: { x: number; y: number; w: number; h: number };
        }>;
      };
    };
    expect(payload.annotation.canvas).toEqual(before.canvas);
    expect(payload.annotation.objects).toHaveLength(before.objects.length + 1);
    expect(payload.annotation.objects.at(-1)).toMatchObject({
      id: "img-extra",
      type: "image",
      src: "img/raw/test-1-img-extra.png",
      locked: false,
      rect: { x: 25, y: 33.333333333333336, w: 50, h: 33.33333333333333 },
    });
    expect(existsSync(join(testProjectRoot, "img/raw/test-1-img-extra.png"))).toBe(true);
  });

  it("PUT /api/projects/:project/annotations/:id/images/:objectId replaces image and preserves annotations", async () => {
    const pngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const before = JSON.parse(
      readFileSync(join(testProjectRoot, "annotations/test-1.json"), "utf8"),
    ) as { objects: Array<{ id: string }>; canvas: { width: number; height: number } };
    before.objects.push({
      id: "keep-badge",
      type: "badge",
      source: "manual",
      n: 1,
      at: { x: 12, y: 34 },
    } as never);
    writeFileSync(
      join(testProjectRoot, "annotations/test-1.json"),
      `${JSON.stringify(before, null, 2)}\n`,
    );

    const response = await app.request(
      `/api/projects/${testProject}/annotations/test-1/images/img-main`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: `data:image/png;base64,${pngBase64}`,
          width: 320,
          height: 200,
        }),
      },
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      annotation: {
        canvas: { width: number; height: number };
        objects: Array<{ id: string; crop?: { x: number; y: number; w: number; h: number } }>;
      };
    };
    expect(payload.annotation.canvas).toEqual({ width: 320, height: 200 });
    expect(payload.annotation.objects.find((obj) => obj.id === "keep-badge")).toBeDefined();
    expect(payload.annotation.objects.find((obj) => obj.id === "img-main")?.crop).toEqual({
      x: 0,
      y: 0,
      w: 320,
      h: 200,
    });
    expect(readFileSync(join(testProjectRoot, "img/raw/test-1.png")).equals(Buffer.from(pngBase64, "base64"))).toBe(true);
  });

  it("PATCH /api/projects/:project/annotations/:id/id renames annotation, images and manual reference", async () => {
    const sourceId = "rename-source";
    const renamedId = "renamed-1";
    const sourceAnnotation = JSON.parse(
      readFileSync(join(testProjectRoot, "annotations/test-1.json"), "utf8"),
    ) as { objects: Array<{ type: string; src?: string }> };
    sourceAnnotation.objects = sourceAnnotation.objects.map((obj) =>
      obj.type === "image" ? { ...obj, src: `img/raw/${sourceId}.png` } : obj,
    );
    writeFileSync(
      join(testProjectRoot, `annotations/${sourceId}.json`),
      `${JSON.stringify(sourceAnnotation, null, 2)}\n`,
    );
    copyFileSync(
      join(testProjectRoot, "img/raw/test-1.png"),
      join(testProjectRoot, `img/raw/${sourceId}.png`),
    );
    copyFileSync(
      join(testProjectRoot, "img/test-1.png"),
      join(testProjectRoot, `img/${sourceId}.png`),
    );
    writeFileSync(
      join(testProjectRoot, "manual.md"),
      `${readFileSync(join(testProjectRoot, "manual.md"), "utf8")}\n\`\`\`annotated-image\nsrc: ${sourceId}\n\`\`\`\n`,
    );

    const response = await app.request(
      `/api/projects/${testProject}/annotations/${sourceId}/id`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: renamedId }),
      },
    );
    expect(response.status).toBe(200);
    expect(existsSync(join(testProjectRoot, `annotations/${sourceId}.json`))).toBe(false);
    expect(existsSync(join(testProjectRoot, `annotations/${renamedId}.json`))).toBe(true);
    expect(existsSync(join(testProjectRoot, `img/raw/${renamedId}.png`))).toBe(true);
    expect(existsSync(join(testProjectRoot, `img/${renamedId}.png`))).toBe(true);
    const annotation = JSON.parse(
      readFileSync(join(testProjectRoot, `annotations/${renamedId}.json`), "utf8"),
    ) as { objects: Array<{ type: string; src?: string }> };
    expect(annotation.objects.find((obj) => obj.type === "image")?.src).toBe(
      `img/raw/${renamedId}.png`,
    );
    expect(readFileSync(join(testProjectRoot, "manual.md"), "utf8")).toContain(
      `src: ${renamedId}`,
    );

    const duplicate = await app.request(
      `/api/projects/${testProject}/annotations/${renamedId}/id`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "test-1" }),
      },
    );
    expect(duplicate.status).toBe(409);
  });

  it("POST /api/projects/:project/preview returns html", async () => {
    const response = await app.request(`/api/projects/${testProject}/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markdown: "# Preview\n\n```annotated-image\nsrc: test-1\n```" }),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { html: string };
    expect(payload.html).toContain('data-mm-annotation="test-1"');
    expect(payload.html).toContain("mm-badge");
  });

  it("POST /api/projects/:project/renumber renumbers all annotations and warns on mismatch", async () => {
    writeFileSync(
      join(testProjectRoot, "annotations/renum.json"),
      JSON.stringify({
        version: 1,
        canvas: { width: 100, height: 100 },
        objects: [
          { id: "b1", type: "badge", source: "manual", n: 5, at: { x: 10, y: 10 } },
          { id: "b2", type: "badge", source: "manual", n: 8, at: { x: 20, y: 20 } },
        ],
      }),
      "utf8",
    );
    const response = await app.request(`/api/projects/${testProject}/renumber`, { method: "POST" });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { totalBadges: number; warning: string | null };
    const saved = JSON.parse(readFileSync(join(testProjectRoot, "annotations/renum.json"), "utf8")) as {
      objects: Array<{ n: number }>;
    };
    expect(saved.objects.map((obj) => obj.n)).toEqual([1, 2]);
    expect(payload.totalBadges).toBeGreaterThanOrEqual(2);
    // manual.md に丸数字が無いため必ず不一致警告になる
    expect(payload.warning).toContain("一致しません");
  });

  it("rejects annotation ids containing path traversal", async () => {
    const valid = { version: 1, canvas: { width: 10, height: 10 }, objects: [] };
    const response = await app.request(
      `/api/projects/${testProject}/annotations/${encodeURIComponent("../../pwn")}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(valid),
      },
    );
    expect(response.status).toBe(400);
    expect(existsSync(join(testProjectRoot, "../pwn.json"))).toBe(false);
  });

  it("rejects pasted image ids containing path separators", async () => {
    const pngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const response = await app.request(`/api/projects/${testProject}/images`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "../evil", data: `data:image/png;base64,${pngBase64}`, width: 1, height: 1 }),
    });
    expect(response.status).toBe(400);
    expect(existsSync(join(testProjectRoot, "img/evil.png"))).toBe(false);
  });

  it("does not serve files outside the project root", async () => {
    const response = await app.request(
      `/api/projects/${testProject}/files/${encodeURIComponent("..")}/${encodeURIComponent("..")}/${encodeURIComponent("..")}/package.json`,
    );
    expect(response.status).toBe(404);
  });

  it("does not allow cross-origin requests from arbitrary sites", async () => {
    const response = await app.request("/api/projects", {
      method: "OPTIONS",
      headers: {
        Origin: "https://evil.example",
        "Access-Control-Request-Method": "PUT",
      },
    });
    expect(response.headers.get("access-control-allow-origin")).toBeNull();

    const allowed = await app.request("/api/projects", {
      method: "OPTIONS",
      headers: {
        Origin: "http://127.0.0.1:5173",
        "Access-Control-Request-Method": "PUT",
      },
    });
    expect(allowed.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:5173");
  });

  it("GET /api/watch/:project emits change events", async () => {
    const response = await app.request(`/api/watch/${testProject}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const reader = response.body?.getReader();
    expect(reader).toBeTruthy();

    const decoder = new TextDecoder();
    let buffer = "";

    const readEvent = async (): Promise<string> => {
      while (!buffer.includes("\n\n")) {
        const chunk = await reader!.read();
        if (chunk.done) {
          break;
        }
        buffer += decoder.decode(chunk.value, { stream: true });
      }
      const eventBlock = buffer.split("\n\n")[0] ?? "";
      buffer = buffer.slice(eventBlock.length + 2);
      return eventBlock;
    };

    const ready = await readEvent();
    expect(ready).toContain("event: ready");

    await new Promise((resolve) => setTimeout(resolve, 150));
    writeFileSync(join(testProjectRoot, "watch-trigger.md"), "changed", "utf8");

    const changed = await Promise.race([
      readEvent(),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error("timeout")), 2500)),
    ]);
    expect(changed).toContain("event: file");
    expect(changed).toContain("watch-trigger.md");

    await reader!.cancel();
  });
});
