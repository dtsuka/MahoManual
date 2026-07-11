import { createServer, type Server } from "node:http";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { imageSize } from "image-size";
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

  it("captures selector target: image pixels match region and crop", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "mahomanual-capture-sel-"));
    try {
      writeProjectYaml(projectRoot, baseUrl);

      const recipe = parseRecipe(`
url: /
viewport: { width: 1280, height: 900 }
screenshot:
  target: "#addtag"
output: "cap-sel"
annotate:
  - type: badge
    selector: "#tag-name"
`);
      const result = await runCapture(projectRoot, recipe, {
        recipeId: "cap-sel",
        pageUrl: `${baseUrl}/`,
      });

      const annotation = parseAnnotation(JSON.parse(readFileSync(result.annotationPath, "utf8")));
      const size = imageSize(readFileSync(result.rawImagePath));

      // 撮影画像は要素領域そのもの: crop = 画像ファイルの実ピクセル全域
      const imageObj = annotation.objects.find((o) => o.type === "image");
      expect(imageObj?.crop).toBeDefined();
      expect(Math.abs((imageObj?.crop?.w ?? 0) - (size.width ?? 0))).toBeLessThanOrEqual(2);
      expect(Math.abs((imageObj?.crop?.h ?? 0) - (size.height ?? 0))).toBeLessThanOrEqual(2);

      // canvas は CSS px = 実ピクセルの 1/2(deviceScaleFactor: 2)
      expect(Math.abs(annotation.canvas.width * 2 - (size.width ?? 0))).toBeLessThanOrEqual(2);
      expect(Math.abs(annotation.canvas.height * 2 - (size.height ?? 0))).toBeLessThanOrEqual(2);

      // 要素は viewport(1280×900)より小さい領域のはず
      expect(annotation.canvas.width).toBeLessThan(1280);
      expect(annotation.canvas.height).toBeLessThan(900);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  }, 30000);

  it("applies screenshot.margin: canvas expands, rect offsets, png stays region-only (SPEC §4.5)", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "mahomanual-capture-margin-"));
    try {
      writeProjectYaml(projectRoot, baseUrl);

      const base = await runCapture(
        projectRoot,
        parseRecipe(`
url: /
viewport: { width: 1280, height: 900 }
screenshot:
  target: { x: 220, y: 0, w: 400, h: 300 }
output: "cap-margin-base"
annotate:
  - type: badge
    selector: "#tag-name"
`),
        { recipeId: "cap-margin-base", pageUrl: `${baseUrl}/` },
      );

      const withMargin = await runCapture(
        projectRoot,
        parseRecipe(`
url: /
viewport: { width: 1280, height: 900 }
screenshot:
  target: { x: 220, y: 0, w: 400, h: 300 }
  margin: { left: 100, top: 50 }
output: "cap-margin"
annotate:
  - type: badge
    selector: "#tag-name"
`),
        { recipeId: "cap-margin", pageUrl: `${baseUrl}/` },
      );

      const baseAnnotation = parseAnnotation(
        JSON.parse(readFileSync(base.annotationPath, "utf8")),
      );
      const annotation = parseAnnotation(
        JSON.parse(readFileSync(withMargin.annotationPath, "utf8")),
      );
      const size = imageSize(readFileSync(withMargin.rawImagePath));

      // canvasは領域+余白、スクショPNGは領域のみ(余白画素を含まない)
      expect(annotation.canvas).toEqual({ width: 500, height: 350 });
      expect(size.width).toBe(800);
      expect(size.height).toBe(600);

      // imageは余白分オフセットして配置、cropは領域全体のまま
      const imageObj = annotation.objects.find((o) => o.type === "image");
      expect(imageObj?.rect.x).toBeCloseTo(20, 6);
      expect(imageObj?.rect.y).toBeCloseTo((50 / 350) * 100, 6);
      expect(imageObj?.rect.w).toBeCloseTo(80, 6);
      expect(imageObj?.rect.h).toBeCloseTo((300 / 350) * 100, 6);
      expect(imageObj?.crop).toEqual({ x: 0, y: 0, w: 800, h: 600 });

      // 注釈の%座標は余白込みで再計算される(余白なし撮影と同じ実位置)
      const baseBadge = baseAnnotation.objects.find((o) => o.type === "badge");
      const badge = annotation.objects.find((o) => o.type === "badge");
      expect(badge?.at.x).toBeCloseTo(
        ((((baseBadge?.at.x ?? 0) / 100) * 400 + 100) / 500) * 100,
        6,
      );
      expect(badge?.at.y).toBeCloseTo(
        ((((baseBadge?.at.y ?? 0) / 100) * 300 + 50) / 350) * 100,
        6,
      );
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  }, 30000);

  it("captures clip target: canvas equals clip rect and image matches", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "mahomanual-capture-clip-"));
    try {
      writeProjectYaml(projectRoot, baseUrl);

      const recipe = parseRecipe(`
url: /
viewport: { width: 1280, height: 900 }
screenshot:
  target: { x: 220, y: 0, w: 400, h: 300 }
output: "cap-clip"
`);
      const result = await runCapture(projectRoot, recipe, {
        recipeId: "cap-clip",
        pageUrl: `${baseUrl}/`,
      });

      const annotation = parseAnnotation(JSON.parse(readFileSync(result.annotationPath, "utf8")));
      const size = imageSize(readFileSync(result.rawImagePath));

      expect(annotation.canvas).toEqual({ width: 400, height: 300 });
      expect(size.width).toBe(800);
      expect(size.height).toBe(600);

      const imageObj = annotation.objects.find((o) => o.type === "image");
      expect(imageObj?.crop).toEqual({ x: 0, y: 0, w: 800, h: 600 });
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
