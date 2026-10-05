import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { imageSize } from "image-size";
import { chromium, type Page } from "playwright";
import { parse as parseYaml } from "yaml";
import { badgePointFromBox, frameRectFromBox, type Region } from "./capture-math.js";
import { expandCanvas } from "./expand-canvas.js";
import { mergeAnnotations } from "./merge-annotations.js";
import { assertSafeName } from "./safe-name.js";
import {
  parseAnnotation,
  type AnnotateItem,
  type AnnotationFile,
  type AnnotationObject,
  type CaptureRecipe,
  type RecipeStep,
} from "./schema.js";

const DEVICE_SCALE = 2;

export interface RunCaptureOptions {
  recipeId: string;
  pageUrl?: string;
  storageStatePath?: string;
}

export interface RunCaptureResult {
  rawImagePath: string;
  displayImagePath: string;
  annotationPath: string;
  annotation: AnnotationFile;
}

interface ProjectConfig {
  title?: string;
  baseUrl?: string;
}

function loadProjectConfig(projectRoot: string): ProjectConfig {
  const path = join(projectRoot, "project.yaml");
  if (!existsSync(path)) {
    return {};
  }
  return (parseYaml(readFileSync(path, "utf8")) as ProjectConfig) ?? {};
}

function resolveRecipeUrl(projectRoot: string, recipe: CaptureRecipe, overrideUrl?: string): string {
  if (overrideUrl) {
    return overrideUrl;
  }
  if (recipe.url.startsWith("http://") || recipe.url.startsWith("https://")) {
    return recipe.url;
  }
  const { baseUrl } = loadProjectConfig(projectRoot);
  if (!baseUrl) {
    throw new Error("project.yaml baseUrl is required for relative recipe URLs");
  }
  return new URL(recipe.url, baseUrl).href;
}

async function runStep(page: Page, step: RecipeStep): Promise<void> {
  if ("waitFor" in step) {
    await page.waitForSelector(step.waitFor);
    return;
  }
  if ("click" in step) {
    await page.click(step.click);
    return;
  }
  if ("hover" in step) {
    await page.hover(step.hover);
    return;
  }
  if ("fill" in step) {
    await page.fill(step.fill.selector, step.fill.value);
    return;
  }
  const _exhaustive: never = step;
  return _exhaustive;
}

interface PageBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CaptureMeasurement {
  // 撮影に使う領域(ドキュメント座標・CSS px・整数)
  clip: Region;
  // 各 annotate 対象の矩形(ドキュメント座標・CSS px)。見つからなければ null
  boxes: Array<PageBox | null>;
}

// 撮影前に、撮影領域と全 annotate 対象を同じ時点・同じ座標系(ドキュメント座標)で測る。
// boundingBox() は viewport 基準なので window.scrollX/Y を足してドキュメント座標にする。
// 測ってから撮影までページを操作しないため、撮影時のスクロールで位置がずれない
async function measureCapture(
  page: Page,
  recipe: CaptureRecipe,
  annotateItems: AnnotateItem[],
): Promise<CaptureMeasurement> {
  const target = recipe.screenshot.target;
  if (typeof target === "string" && target !== "fullPage") {
    await page.locator(target).first().scrollIntoViewIfNeeded();
  }

  const state = await page.evaluate(() => ({
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }));
  const toDocument = (box: PageBox | null): PageBox | null =>
    box ? { ...box, x: box.x + state.scrollX, y: box.y + state.scrollY } : null;

  let region: Region;
  if (target === "fullPage") {
    // body の boundingBox は margin 分ズレるため、ドキュメント全体を基準にする
    region = { x: 0, y: 0, w: state.width, h: state.height };
  } else if (typeof target === "string") {
    const box = toDocument(await page.locator(target).first().boundingBox());
    if (!box) {
      throw new Error(`unable to resolve screenshot region for selector: ${target}`);
    }
    region = { x: box.x, y: box.y, w: box.width, h: box.height };
  } else {
    // clip は撮影時点の viewport 基準の矩形として扱う
    region = { x: target.x + state.scrollX, y: target.y + state.scrollY, w: target.w, h: target.h };
  }

  const boxes = await Promise.all(
    annotateItems.map(async (item) => toDocument(await page.locator(item.selector).first().boundingBox())),
  );
  return { clip: enclosingClip(region, state), boxes };
}

// Playwright は小数の撮影領域を外側の整数 px へ広げて撮るため、先に同じ規則で整数化し、
// ドキュメントの範囲内に収める。これを撮影と%座標計算の両方に使う
function enclosingClip(region: Region, documentSize: { width: number; height: number }): Region {
  const x = Math.max(0, Math.floor(region.x + 1e-3));
  const y = Math.max(0, Math.floor(region.y + 1e-3));
  const right = Math.min(documentSize.width, Math.ceil(region.x + region.w - 1e-3));
  const bottom = Math.min(documentSize.height, Math.ceil(region.y + region.h - 1e-3));
  if (right <= x || bottom <= y) {
    throw new Error("撮影領域がページの外にあります");
  }
  return { x, y, w: right - x, h: bottom - y };
}

// ドキュメント座標の clip で撮る(fullPage 指定によりスクロール位置に関係なく撮れる)
async function takeScreenshot(page: Page, clip: Region, path: string): Promise<void> {
  await page.screenshot({
    path,
    fullPage: true,
    clip: { x: clip.x, y: clip.y, width: clip.w, height: clip.h },
  });
}

function readPngSize(path: string): { w: number; h: number } {
  const size = imageSize(readFileSync(path));
  if (!size.width || !size.height) {
    throw new Error(`撮影画像のサイズを読み取れません: ${path}`);
  }
  return { w: size.width, h: size.height };
}

function buildAnnotationObjects(
  recipeId: string,
  output: string,
  region: Region,
  pngSize: { w: number; h: number },
  annotateItems: AnnotateItem[],
  boxes: Array<PageBox | null>,
): AnnotationObject[] {
  const objects: AnnotationObject[] = [
    {
      id: `${recipeId}-image`,
      type: "image",
      source: "recipe",
      recipeRef: `${recipeId}#image`,
      locked: true,
      src: `img/raw/${output}.png`,
      rect: { x: 0, y: 0, w: 100, h: 100 },
      // crop は画像ファイルの実ピクセル(SPEC §4.1)。撮影後のPNGから読む
      crop: { x: 0, y: 0, w: pngSize.w, h: pngSize.h },
    },
  ];

  let badgeNumber = 1;
  annotateItems.forEach((item, index) => {
    const found = boxes[index];
    if (!found) {
      return;
    }
    const box = {
      x: found.x,
      y: found.y,
      w: found.width,
      h: found.height,
    };

    if (item.type === "badge") {
      objects.push({
        id: `${recipeId}-r${index}`,
        type: "badge",
        source: "recipe",
        recipeRef: `${recipeId}#${index}`,
        n: badgeNumber++,
        at: badgePointFromBox(box, region, {
          anchor: item.anchor,
          offset: item.offset,
        }),
      });
      return;
    }

    objects.push({
      id: `${recipeId}-r${index}`,
      type: "frame",
      source: "recipe",
      recipeRef: `${recipeId}#${index}`,
      rect: frameRectFromBox(box, region, item.padding ?? 4),
    });
  });

  return objects;
}

export async function runCapture(
  projectRoot: string,
  recipe: CaptureRecipe,
  options: RunCaptureOptions,
): Promise<RunCaptureResult> {
  const recipeId = assertSafeName(options.recipeId, "レシピID");
  const output = assertSafeName(recipe.output, "出力ID");
  const url = resolveRecipeUrl(projectRoot, recipe, options.pageUrl);
  const viewport = recipe.viewport ?? { width: 1280, height: 900 };
  const storageStatePath =
    options.storageStatePath ?? join(projectRoot, ".auth", "state.json");

  mkdirSync(join(projectRoot, "img", "raw"), { recursive: true });
  mkdirSync(join(projectRoot, "img"), { recursive: true });
  mkdirSync(join(projectRoot, "annotations"), { recursive: true });

  const rawImagePath = join(projectRoot, "img", "raw", `${output}.png`);
  const displayImagePath = join(projectRoot, "img", `${output}.png`);
  const annotationPath = join(projectRoot, "annotations", `${output}.json`);

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: DEVICE_SCALE,
      ...(existsSync(storageStatePath) ? { storageState: storageStatePath } : {}),
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" });

    if (recipe.steps) {
      for (const step of recipe.steps) {
        await runStep(page, step);
      }
    }

    const annotateItems = recipe.annotate ?? [];
    const { clip, boxes } = await measureCapture(page, recipe, annotateItems);
    await takeScreenshot(page, clip, rawImagePath);
    copyFileSync(rawImagePath, displayImagePath);

    // 実際に撮れた範囲(ページ端で切り詰められた場合を含む)を PNG の実サイズから求める
    const pngSize = readPngSize(rawImagePath);
    const region: Region = {
      x: clip.x,
      y: clip.y,
      w: pngSize.w / DEVICE_SCALE,
      h: pngSize.h / DEVICE_SCALE,
    };

    const regionCaptured: AnnotationFile = {
      version: 1,
      canvas: { width: region.w, height: region.h },
      objects: buildAnnotationObjects(recipeId, output, region, pngSize, annotateItems, boxes),
    };
    // SPEC §9.2: margin指定時はキャンバス余白を適用してからマージする
    // (スクショPNGは領域のみ。余白はレイアウトとして表現される)
    const captured = recipe.screenshot.margin
      ? expandCanvas(regionCaptured, recipe.screenshot.margin)
      : regionCaptured;

    const existingPath = annotationPath;
    const existing = existsSync(existingPath)
      ? parseAnnotation(JSON.parse(readFileSync(existingPath, "utf8")))
      : null;
    const merged = mergeAnnotations(existing, captured, recipeId);
    writeFileSync(annotationPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");

    return {
      rawImagePath,
      displayImagePath,
      annotationPath,
      annotation: merged,
    };
  } finally {
    await browser.close();
  }
}

export async function runAllCaptures(
  projectRoot: string,
  recipes: Array<{ recipeId: string; recipe: CaptureRecipe; pageUrl?: string }>,
): Promise<RunCaptureResult[]> {
  const results: RunCaptureResult[] = [];
  for (const entry of recipes) {
    results.push(await runCapture(projectRoot, entry.recipe, {
      recipeId: entry.recipeId,
      pageUrl: entry.pageUrl,
    }));
  }
  return results;
}
