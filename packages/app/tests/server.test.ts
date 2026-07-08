import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
  const exampleImage = join(repoRoot, "projects/example/img/raw/1-1.png");
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
  });

  it("GET /api/projects lists manuals", async () => {
    const response = await app.request("/api/projects");
    expect(response.status).toBe(200);
    const projects = (await response.json()) as Array<{ name: string }>;
    expect(projects.some((project) => project.name === "example")).toBe(true);
    expect(projects.some((project) => project.name === testProject)).toBe(true);
  });

  it("GET /api/projects/:project/annotations/:id returns annotation", async () => {
    const response = await app.request(`/api/projects/${testProject}/annotations/test-1`);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { annotation: { version: number } };
    expect(payload.annotation.version).toBe(1);
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
