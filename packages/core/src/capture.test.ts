import { createServer, type Server } from "node:http";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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

describe("runCapture: positions when the page scrolls or has fractional sizes", () => {
  function writePage(projectRoot: string, name: string, html: string): string {
    const path = join(projectRoot, name);
    writeFileSync(path, `<!doctype html><html><body style="margin:0">${html}</body></html>`, "utf8");
    return pathToFileURL(path).href;
  }

  it("places annotations correctly when the selector target is below the fold", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "mahomanual-capture-scroll-sel-"));
    try {
      writeProjectYaml(projectRoot, baseUrl);
      const pageUrl = writePage(projectRoot, "page.html", `
<div style="height:2000px"></div>
<div id="panel" style="width:400px;height:300px;background:#eee;position:relative">
  <input id="field" style="position:absolute;left:100px;top:50px;width:200px;height:30px;box-sizing:border-box;border:0">
</div>
<div style="height:2000px"></div>`);
      const result = await runCapture(projectRoot, parseRecipe(`
url: /
screenshot:
  target: "#panel"
output: "scroll-sel"
annotate:
  - type: frame
    selector: "#field"
    padding: 0
`), { recipeId: "scroll-sel", pageUrl });

      expect(result.annotation.canvas).toEqual({ width: 400, height: 300 });
      const frame = result.annotation.objects.find((o) => o.type === "frame");
      expect(frame?.rect.x).toBeCloseTo(25, 6);
      expect(frame?.rect.y).toBeCloseTo((50 / 300) * 100, 6);
      expect(frame?.rect.w).toBeCloseTo(50, 6);
      expect(frame?.rect.h).toBeCloseTo(10, 6);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("places annotations correctly on a fullPage capture after a click step scrolls the page", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "mahomanual-capture-scroll-full-"));
    try {
      writeProjectYaml(projectRoot, baseUrl);
      const pageUrl = writePage(projectRoot, "page.html", `
<div style="height:2000px"></div>
<button id="btn" style="position:absolute;left:100px;top:2000px;width:100px;height:40px">b</button>
<div style="height:2000px"></div>`);
      const result = await runCapture(projectRoot, parseRecipe(`
url: /
steps:
  - click: "#btn"
screenshot:
  target: fullPage
output: "scroll-full"
annotate:
  - type: frame
    selector: "#btn"
    padding: 0
`), { recipeId: "scroll-full", pageUrl });

      const { canvas } = result.annotation;
      const frame = result.annotation.objects.find((o) => o.type === "frame");
      expect(((frame?.rect.x ?? 0) / 100) * canvas.width).toBeCloseTo(100, 3);
      expect(((frame?.rect.y ?? 0) / 100) * canvas.height).toBeCloseTo(2000, 3);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("uses the real PNG size for crop and the real clip for % positions with fractional element sizes", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "mahomanual-capture-frac-"));
    try {
      writeProjectYaml(projectRoot, baseUrl);
      const pageUrl = writePage(
        projectRoot,
        "page.html",
        `<div id="t" style="position:absolute;left:10.3px;top:7.7px;width:300.25px;height:120.75px;background:red"></div>`,
      );
      const result = await runCapture(projectRoot, parseRecipe(`
url: /
screenshot:
  target: "#t"
output: "frac"
annotate:
  - type: frame
    selector: "#t"
    padding: 0
`), { recipeId: "frac", pageUrl });

      const size = imageSize(readFileSync(result.rawImagePath));
      const { canvas } = result.annotation;
      const image = result.annotation.objects.find((o) => o.type === "image");
      expect(image?.crop).toEqual({ x: 0, y: 0, w: size.width, h: size.height });
      // canvas は撮影に使った領域(CSS px)。PNG は deviceScaleFactor 2 の実ピクセル
      expect(canvas.width * 2).toBe(size.width);
      expect(canvas.height * 2).toBe(size.height);

      // 枠は画像の中で要素がある位置(CSS px)を指す
      const frame = result.annotation.objects.find((o) => o.type === "frame");
      const left = ((frame?.rect.x ?? 0) / 100) * canvas.width;
      const top = ((frame?.rect.y ?? 0) / 100) * canvas.height;
      const width = ((frame?.rect.w ?? 0) / 100) * canvas.width;
      const height = ((frame?.rect.h ?? 0) / 100) * canvas.height;
      expect(left).toBeGreaterThanOrEqual(0);
      expect(top).toBeGreaterThanOrEqual(0);
      expect(left).toBeLessThan(1);
      expect(top).toBeLessThan(1);
      expect(width).toBeCloseTo(300.25, 3);
      expect(height).toBeCloseTo(120.75, 3);
      expect(left + width).toBeLessThanOrEqual(canvas.width + 1e-6);
      expect(top + height).toBeLessThanOrEqual(canvas.height + 1e-6);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});

function writeProjectYaml(projectRoot: string, baseUrl: string): void {
  mkdirSync(join(projectRoot, "annotations"), { recursive: true });
  mkdirSync(join(projectRoot, "img", "raw"), { recursive: true });
  writeFileSync(join(projectRoot, "project.yaml"), `title: capture test\nbaseUrl: ${baseUrl}\n`);
  writeFileSync(join(projectRoot, "manual.md"), "# test\n");
}
