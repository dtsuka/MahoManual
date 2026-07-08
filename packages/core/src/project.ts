import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { AnnotationFile, AnnotationObject } from "./schema.js";
import {
  annotationObjectSchema,
  parseAnnotation,
  parseRecipe,
  type CaptureRecipe,
} from "./schema.js";

export function renumberBadges(annotation: AnnotationFile): AnnotationFile {
  let counter = 1;
  const objects = annotation.objects.map((obj): AnnotationObject => {
    if (obj.type !== "badge") {
      return obj;
    }
    return { ...obj, n: counter++ };
  });
  return { ...annotation, objects };
}

export interface ProjectInfo {
  name: string;
  title: string;
  pageCount: number;
  imageCount: number;
}

export interface ManualContents {
  body: string;
  annotations: string[];
  captures: string[];
}

function annotationPath(projectRoot: string, id: string): string {
  return join(projectRoot, "annotations", `${id}.json`);
}

export function readProjectYaml(projectRoot: string): Record<string, string> {
  const path = join(projectRoot, "project.yaml");
  if (!existsSync(path)) {
    return {};
  }
  return (parseYaml(readFileSync(path, "utf8")) as Record<string, string>) ?? {};
}

export function listManuals(projectsDir: string): ProjectInfo[] {
  if (!existsSync(projectsDir)) {
    return [];
  }
  return readdirSync(projectsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const projectRoot = join(projectsDir, entry.name);
      if (!existsSync(join(projectRoot, "manual.md"))) {
        return null;
      }
      const yaml = readProjectYaml(projectRoot);
      const annotationsDir = join(projectRoot, "annotations");
      const imageCount = existsSync(annotationsDir)
        ? readdirSync(annotationsDir).filter((name) => name.endsWith(".json")).length
        : 0;
      const body = readFileSync(join(projectRoot, "manual.md"), "utf8");
      const pageCount = (body.match(/^##\s+/gm) ?? []).length;
      return {
        name: entry.name,
        title: yaml.title ?? entry.name,
        pageCount,
        imageCount,
      };
    })
    .filter((item): item is ProjectInfo => item !== null);
}

export function readManual(projectRoot: string): ManualContents {
  const annotationsDir = join(projectRoot, "annotations");
  const capturesDir = join(projectRoot, "captures");
  return {
    body: readFileSync(join(projectRoot, "manual.md"), "utf8"),
    annotations: existsSync(annotationsDir)
      ? readdirSync(annotationsDir).filter((name) => name.endsWith(".json")).map((name) => basename(name, ".json"))
      : [],
    captures: existsSync(capturesDir)
      ? readdirSync(capturesDir).filter((name) => name.endsWith(".yaml") || name.endsWith(".yml")).map((name) => basename(name, name.endsWith(".yaml") ? ".yaml" : ".yml"))
      : [],
  };
}

export function readAnnotationFile(projectRoot: string, id: string): AnnotationFile {
  const path = annotationPath(projectRoot, id);
  if (!existsSync(path)) {
    throw new Error(`注釈ファイルが見つかりません: ${id}`);
  }
  return parseAnnotation(JSON.parse(readFileSync(path, "utf8")));
}

export function writeAnnotationFile(projectRoot: string, id: string, annotation: AnnotationFile): void {
  const parsed = parseAnnotation(annotation);
  mkdirSync(join(projectRoot, "annotations"), { recursive: true });
  writeFileSync(annotationPath(projectRoot, id), `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
}

export function addAnnotationObject(
  projectRoot: string,
  id: string,
  object: AnnotationObject,
): AnnotationFile {
  const validated = annotationObjectSchema.parse(object);
  const annotation = readAnnotationFile(projectRoot, id);
  if (annotation.objects.some((obj) => obj.id === validated.id)) {
    throw new Error(`duplicate object id: ${validated.id}`);
  }
  const next = { ...annotation, objects: [...annotation.objects, validated] };
  writeAnnotationFile(projectRoot, id, next);
  return next;
}

export function updateAnnotationObject(
  projectRoot: string,
  id: string,
  objectId: string,
  patch: Partial<AnnotationObject>,
): AnnotationFile {
  const annotation = readAnnotationFile(projectRoot, id);
  const index = annotation.objects.findIndex((obj) => obj.id === objectId);
  if (index < 0) {
    throw new Error(`object not found: ${objectId}`);
  }
  const current = annotation.objects[index];
  const merged = { ...current, ...patch, id: current.id, type: current.type };
  const validated = annotationObjectSchema.parse(merged);
  const objects = [...annotation.objects];
  objects[index] = validated;
  const next = { ...annotation, objects };
  writeAnnotationFile(projectRoot, id, next);
  return next;
}

export function removeAnnotationObject(projectRoot: string, id: string, objectId: string): AnnotationFile {
  const annotation = readAnnotationFile(projectRoot, id);
  const next = {
    ...annotation,
    objects: annotation.objects.filter((obj) => obj.id !== objectId),
  };
  if (next.objects.length === annotation.objects.length) {
    throw new Error(`object not found: ${objectId}`);
  }
  writeAnnotationFile(projectRoot, id, next);
  return next;
}

export function setCrop(
  projectRoot: string,
  id: string,
  objectId: string,
  crop: { x: number; y: number; w: number; h: number },
): AnnotationFile {
  const annotation = readAnnotationFile(projectRoot, id);
  const index = annotation.objects.findIndex((obj) => obj.id === objectId);
  if (index < 0) {
    throw new Error(`object not found: ${objectId}`);
  }
  const current = annotation.objects[index];
  if (current.type !== "image") {
    throw new Error(`object is not image: ${objectId}`);
  }
  return updateAnnotationObject(projectRoot, id, objectId, { crop });
}

export function renumberBadgesFile(projectRoot: string, id: string): AnnotationFile {
  const annotation = readAnnotationFile(projectRoot, id);
  const next = renumberBadges(annotation);
  writeAnnotationFile(projectRoot, id, next);
  return next;
}

export function loadRecipeFile(recipePath: string): CaptureRecipe {
  return parseRecipe(readFileSync(recipePath, "utf8"));
}

export function listRecipeFiles(projectRoot: string): Array<{ id: string; path: string; recipe: CaptureRecipe }> {
  const capturesDir = join(projectRoot, "captures");
  if (!existsSync(capturesDir)) {
    return [];
  }
  return readdirSync(capturesDir)
    .filter((name) => name.endsWith(".yaml") || name.endsWith(".yml"))
    .map((name) => {
      const path = join(capturesDir, name);
      const recipe = loadRecipeFile(path);
      return {
        id: basename(name, name.endsWith(".yaml") ? ".yaml" : ".yml"),
        path,
        recipe,
      };
    });
}

// build / pdf / capture は unified・Playwright を連鎖 import して重いため、
// 使うときだけ動的 import する(CLI の起動時間を軽く保つ)
export async function buildManualHtml(
  projectRoot: string,
  options: { singleFile?: boolean; outputDir?: string } = {},
): Promise<string> {
  const { buildProject } = await import("./build.js");
  const result = await buildProject(projectRoot, options);
  return result.htmlPath;
}

export async function exportManualPdf(projectRoot: string, outputPath?: string): Promise<string> {
  const { buildProject } = await import("./build.js");
  const { exportPdf } = await import("./pdf.js");
  const distDir = join(projectRoot, "dist");
  await buildProject(projectRoot, { outputDir: distDir });
  const pdfPath = outputPath ?? join(distDir, "manual.pdf");
  await exportPdf(distDir, { outputPath: pdfPath });
  return pdfPath;
}

export async function runProjectCapture(
  projectRoot: string,
  recipeId?: string,
): Promise<Array<{ recipeId: string; output: string }>> {
  const { runAllCaptures } = await import("./capture.js");
  const recipes = listRecipeFiles(projectRoot);
  const selected = recipeId ? recipes.filter((item) => item.id === recipeId) : recipes;
  if (recipeId && selected.length === 0) {
    throw new Error(`レシピが見つかりません: ${recipeId}`);
  }
  const results = await runAllCaptures(
    projectRoot,
    selected.map((item) => ({ recipeId: item.id, recipe: item.recipe })),
  );
  return results.map((result, index) => ({
    recipeId: selected[index]?.id ?? "",
    output: basename(result.annotationPath, ".json"),
  }));
}

export function createAnnotationSkeleton(
  projectRoot: string,
  id: string,
  imageSrc: string,
  canvas: { width: number; height: number },
): AnnotationFile {
  const annotation: AnnotationFile = {
    version: 1,
    canvas,
    objects: [
      {
        id: "img-main",
        type: "image",
        source: "manual",
        src: imageSrc,
        rect: { x: 0, y: 0, w: 100, h: 100 },
      },
    ],
  };
  writeAnnotationFile(projectRoot, id, annotation);
  return annotation;
}

export function savePastedImage(
  projectRoot: string,
  id: string,
  buffer: Buffer,
  canvas: { width: number; height: number },
): { imagePath: string; annotation: AnnotationFile } {
  const rawDir = join(projectRoot, "img", "raw");
  mkdirSync(rawDir, { recursive: true });
  const imagePath = join(rawDir, `${id}.png`);
  writeFileSync(imagePath, buffer);
  copyFileSync(imagePath, join(projectRoot, "img", `${id}.png`));
  const annotation = createAnnotationSkeleton(projectRoot, id, `img/raw/${id}.png`, canvas);
  return { imagePath, annotation };
}

export function countUnicodeBadges(markdown: string): number {
  const matches = markdown.match(/[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]/gu);
  return matches?.length ?? 0;
}

export function countAnnotationBadges(annotation: AnnotationFile): number {
  return annotation.objects.filter((obj) => obj.type === "badge").length;
}
