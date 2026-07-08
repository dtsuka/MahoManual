import { createServer, type Server } from "node:http";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCapture } from "./capture.js";
import { parseAnnotation } from "./schema.js";
import { parseRecipe } from "./schema.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../tests/fixtures");
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = createServer((req, res) => {
      const html = readFileSync(join(fixturesDir, "fake-cms/index.html"), "utf8");
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

describe("runCapture", () => {
  it("captures fake CMS with recipe and writes images + annotation JSON", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "mahomanual-capture-"));
    try {
      cpSync(join(fixturesDir, "fake-cms"), join(projectRoot, "fake-cms"), { recursive: true });
      writeProjectYaml(projectRoot, baseUrl);

      const recipeYaml = `
url: /
viewport: { width: 1280, height: 900 }
steps:
  - waitFor: "#addtag"
  - fill: { selector: "#tag-name", value: "テスト施設" }
screenshot:
  target: fullPage
output: "cap-1"
annotate:
  - type: badge
    selector: "#tag-name"
  - type: badge
    selector: "#tag-slug"
  - type: frame
    selector: "#menu-posts .current"
    padding: 4
`;
      const recipe = parseRecipe(recipeYaml);
      const result = await runCapture(projectRoot, recipe, {
        recipeId: "cap-1",
        pageUrl: `${baseUrl}/`,
      });

      expect(existsSync(result.rawImagePath)).toBe(true);
      expect(existsSync(result.displayImagePath)).toBe(true);
      expect(existsSync(result.annotationPath)).toBe(true);

      const annotation = parseAnnotation(JSON.parse(readFileSync(result.annotationPath, "utf8")));
      expect(annotation.canvas).toEqual({ width: 1280, height: 1200 });
      const recipeObjects = annotation.objects.filter((o) => o.source === "recipe");
      expect(recipeObjects).toHaveLength(4);
      expect(recipeObjects.filter((o) => o.type === "badge").map((o) => o.n)).toEqual([1, 2]);

      const imageObj = annotation.objects.find((o) => o.type === "image");
      expect(imageObj?.crop).toEqual({
        x: 0,
        y: 0,
        w: 1280 * 2,
        h: expect.any(Number),
      });
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  }, 30000);
});

function writeProjectYaml(projectRoot: string, baseUrl: string): void {
  mkdirSync(join(projectRoot, "annotations"), { recursive: true });
  mkdirSync(join(projectRoot, "img", "raw"), { recursive: true });
  writeFileSync(join(projectRoot, "project.yaml"), `title: capture test\nbaseUrl: ${baseUrl}\n`);
  writeFileSync(join(projectRoot, "manual.md"), "# test\n");
}
