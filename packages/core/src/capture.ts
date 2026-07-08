import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { parse as parseYaml } from "yaml";
import { badgePointFromBox, frameRectFromBox, type Region } from "./capture-math.js";
import { mergeAnnotations } from "./merge-annotations.js";
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

async function resolveRegion(page: Page, recipe: CaptureRecipe): Promise<Region> {
  const target = recipe.screenshot.target;
  if (target === "fullPage") {
    const size = page.locator("body").first();
    const box = await size.boundingBox();
    if (!box) {
      throw new Error("unable to resolve fullPage region");
    }
    return { x: 0, y: 0, w: box.width, h: box.height };
  }
  if (typeof target === "string") {
    const box = await page.locator(target).first().boundingBox();
    if (!box) {
      throw new Error(`unable to resolve screenshot region for selector: ${target}`);
    }
    return { x: box.x, y: box.y, w: box.width, h: box.height };
  }
  return { x: target.x, y: target.y, w: target.w, h: target.h };
}

function buildAnnotationObjects(
  recipeId: string,
  output: string,
  region: Region,
  annotateItems: AnnotateItem[],
  boxes: Array<{ item: AnnotateItem; box: { x: number; y: number; width: number; height: number } | null }>,
): AnnotationObject[] {
  const objects: AnnotationObject[] = [
    {
      id: `${recipeId}-image`,
      type: "image",
      source: "recipe",
      recipeRef: `${recipeId}#image`,
      src: `img/raw/${output}.png`,
      rect: { x: 0, y: 0, w: 100, h: 100 },
      crop: {
        x: 0,
        y: 0,
        w: Math.round(region.w * DEVICE_SCALE),
        h: Math.round(region.h * DEVICE_SCALE),
      },
    },
  ];

  let badgeNumber = 1;
  annotateItems.forEach((item, index) => {
    const found = boxes[index];
    if (!found?.box) {
      return;
    }
    const box = {
      x: found.box.x,
      y: found.box.y,
      w: found.box.width,
      h: found.box.height,
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
  const recipeId = options.recipeId;
  const output = recipe.output;
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

    const region = await resolveRegion(page, recipe);
    await page.screenshot({
      path: rawImagePath,
      fullPage: recipe.screenshot.target === "fullPage",
    });
    copyFileSync(rawImagePath, displayImagePath);

    const annotateItems = recipe.annotate ?? [];
    const boxes = await Promise.all(
      annotateItems.map(async (item) => ({
        item,
        box: await page.locator(item.selector).first().boundingBox(),
      })),
    );

    const captured: AnnotationFile = {
      version: 1,
      canvas: { width: Math.round(region.w), height: Math.round(region.h) },
      objects: buildAnnotationObjects(recipeId, output, region, annotateItems, boxes),
    };

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
