import {
  copyFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { YAMLMap, parseDocument, parse as parseYaml } from "yaml";
import type { AnnotationFile, AnnotationObject } from "./schema.js";
import type { AnnotationTheme } from "./theme.js";
import { parseAnnotationDefaults, type AnnotationDefaults } from "./annotation-defaults.js";
import { expandCanvas, type CanvasMargin } from "./expand-canvas.js";
import {
  annotationObjectSchema,
  parseAnnotation,
  parseRecipe,
  type CaptureRecipe,
} from "./schema.js";
import { applyDefaultImageLocks } from "./annotation-objects.js";

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

export function createManualProject(
  projectsRoot: string,
  name: string,
  title = name,
): string {
  if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) {
    throw new Error("不正なプロジェクトIDです");
  }
  const projectRoot = join(projectsRoot, name);
  if (existsSync(projectRoot)) {
    throw new Error(`プロジェクトは既に存在します: ${name}`);
  }
  const cleanTitle = title.replace(/\r?\n/g, " ").trim() || name;

  mkdirSync(join(projectRoot, "annotations"), { recursive: true });
  mkdirSync(join(projectRoot, "img", "raw"), { recursive: true });
  mkdirSync(join(projectRoot, "captures"), { recursive: true });
  writeFileSync(
    join(projectRoot, "project.yaml"),
    `title: ${JSON.stringify(cleanTitle)}\n`,
    "utf8",
  );
  writeFileSync(
    join(projectRoot, "manual.md"),
    `# ${cleanTitle}\n\n## 1 はじめに\n\n本文をここに書きます。\n`,
    "utf8",
  );
  return projectRoot;
}

export function readProjectYaml(projectRoot: string): Record<string, unknown> {
  const path = join(projectRoot, "project.yaml");
  if (!existsSync(path)) {
    return {};
  }
  return (parseYaml(readFileSync(path, "utf8")) as Record<string, unknown>) ?? {};
}

// project.yaml の annotation セクション(テーマ設定)を読む。
// 不正な値は黙って無視する(既定のテーマ CSS 変数が使われる)
export function readProjectTheme(projectRoot: string): AnnotationTheme {
  const yaml = readProjectYaml(projectRoot);
  const annotation = yaml.annotation;
  if (!annotation || typeof annotation !== "object") {
    return {};
  }
  const { color, fontSize } = annotation as { color?: unknown; fontSize?: unknown };
  const theme: AnnotationTheme = {};
  if (typeof color === "string" && /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color)) {
    theme.color = color;
  }
  if (typeof fontSize === "number" && fontSize > 0) {
    theme.fontSize = fontSize;
  }
  return theme;
}

export function readAnnotationDefaults(projectRoot: string): AnnotationDefaults {
  const yaml = readProjectYaml(projectRoot);
  const annotation = yaml.annotation;
  if (!annotation || typeof annotation !== "object") {
    return {};
  }
  return parseAnnotationDefaults((annotation as { defaults?: unknown }).defaults);
}

export function writeAnnotationDefaults(
  projectRoot: string,
  defaults: AnnotationDefaults,
): AnnotationDefaults {
  const path = join(projectRoot, "project.yaml");
  const doc = parseDocument(existsSync(path) ? readFileSync(path, "utf8") : "");
  const hasValues = Object.keys(defaults).length > 0;
  if (hasValues) {
    doc.setIn(["annotation", "defaults"], defaults);
  } else {
    doc.deleteIn(["annotation", "defaults"]);
  }
  const annotation = doc.get("annotation");
  if (annotation == null || (annotation instanceof YAMLMap && annotation.items.length === 0)) {
    doc.delete("annotation");
  }
  writeFileSync(path, doc.toString(), "utf8");
  return readAnnotationDefaults(projectRoot);
}

// project.yaml の annotation セクション(テーマ設定)を書き込む。
// 渡されたキーのみ設定し、省略されたキーは削除する(= 既定値に戻す)。
// title などの他キー・手書きコメント・annotation 内の未知キーは保持する
export function writeProjectTheme(projectRoot: string, theme: AnnotationTheme): AnnotationTheme {
  if (
    theme.color !== undefined &&
    !/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(theme.color)
  ) {
    throw new Error(`不正なカラーコードです: ${theme.color}`);
  }
  if (
    theme.fontSize !== undefined &&
    !(Number.isFinite(theme.fontSize) && theme.fontSize > 0)
  ) {
    throw new Error(`不正なフォントサイズです: ${theme.fontSize}`);
  }

  const path = join(projectRoot, "project.yaml");
  const doc = parseDocument(existsSync(path) ? readFileSync(path, "utf8") : "");
  for (const [key, value] of [
    ["color", theme.color],
    ["fontSize", theme.fontSize],
  ] as const) {
    if (value !== undefined) {
      doc.setIn(["annotation", key], value);
    } else {
      doc.deleteIn(["annotation", key]);
    }
  }
  const annotation = doc.get("annotation");
  if (annotation == null || (annotation instanceof YAMLMap && annotation.items.length === 0)) {
    doc.delete("annotation");
  }
  writeFileSync(path, doc.toString(), "utf8");
  return readProjectTheme(projectRoot);
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
      const title = typeof yaml.title === "string" ? yaml.title : entry.name;
      const annotationsDir = join(projectRoot, "annotations");
      const imageCount = existsSync(annotationsDir)
        ? readdirSync(annotationsDir).filter((name) => name.endsWith(".json")).length
        : 0;
      const body = readFileSync(join(projectRoot, "manual.md"), "utf8");
      const pageCount = (body.match(/^##\s+/gm) ?? []).length;
      return {
        name: entry.name,
        title,
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
  const annotation = parseAnnotation(JSON.parse(readFileSync(path, "utf8")));
  return applyDefaultImageLocks(annotation, id);
}

export function writeAnnotationFile(projectRoot: string, id: string, annotation: AnnotationFile): void {
  const parsed = parseAnnotation(annotation);
  mkdirSync(join(projectRoot, "annotations"), { recursive: true });
  writeFileSync(annotationPath(projectRoot, id), `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
}

export function renameAnnotationId(
  projectRoot: string,
  currentId: string,
  nextId: string,
): AnnotationFile {
  if (currentId === nextId) {
    return readAnnotationFile(projectRoot, currentId);
  }
  const currentPath = annotationPath(projectRoot, currentId);
  const nextPath = annotationPath(projectRoot, nextId);
  if (!existsSync(currentPath)) {
    throw new Error(`注釈ファイルが見つかりません: ${currentId}`);
  }
  if (existsSync(nextPath)) {
    throw new Error(`注釈IDが既に存在します: ${nextId}`);
  }

  const annotation = readAnnotationFile(projectRoot, currentId);
  const imageRenames = new Map<string, string>();
  for (const obj of annotation.objects) {
    if (obj.type !== "image" || basename(obj.src, extname(obj.src)) !== currentId) {
      continue;
    }
    imageRenames.set(obj.src, join(dirname(obj.src), `${nextId}${extname(obj.src)}`));
  }
  for (const directory of ["img/raw", "img"]) {
    const absoluteDirectory = join(projectRoot, directory);
    if (!existsSync(absoluteDirectory)) {
      continue;
    }
    for (const name of readdirSync(absoluteDirectory)) {
      if (basename(name, extname(name)) === currentId) {
        imageRenames.set(join(directory, name), join(directory, `${nextId}${extname(name)}`));
      }
    }
  }
  for (const destination of imageRenames.values()) {
    if (existsSync(join(projectRoot, destination))) {
      throw new Error(`画像ファイルが既に存在します: ${destination}`);
    }
  }

  const updated: AnnotationFile = {
    ...annotation,
    objects: annotation.objects.map((obj) =>
      obj.type === "image" && imageRenames.has(obj.src)
        ? { ...obj, src: imageRenames.get(obj.src)! }
        : obj,
    ),
  };
  writeAnnotationFile(projectRoot, nextId, updated);
  for (const [source, destination] of imageRenames) {
    renameSync(join(projectRoot, source), join(projectRoot, destination));
  }

  const manualPath = join(projectRoot, "manual.md");
  const manual = readFileSync(manualPath, "utf8");
  const escapedId = currentId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nextManual = manual.replace(
    /```annotated-image[^\n]*\n[\s\S]*?```/g,
    (block) => block.replace(
      new RegExp(`^(\\s*src:\\s*)([\"']?)${escapedId}\\2(\\s*)$`, "gm"),
      `$1$2${nextId}$2$3`,
    ),
  );
  if (nextManual !== manual) {
    writeFileSync(manualPath, nextManual, "utf8");
  }
  unlinkSync(currentPath);
  return updated;
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

export function expandCanvasFile(
  projectRoot: string,
  id: string,
  margin: CanvasMargin,
): AnnotationFile {
  const annotation = readAnnotationFile(projectRoot, id);
  const next = expandCanvas(annotation, margin);
  writeAnnotationFile(projectRoot, id, next);
  return next;
}

export function renumberBadgesFile(projectRoot: string, id: string): AnnotationFile {
  const annotation = readAnnotationFile(projectRoot, id);
  const next = renumberBadges(annotation);
  writeAnnotationFile(projectRoot, id, next);
  return next;
}

export interface RenumberAllResult {
  totalBadges: number;
  files: Array<{ id: string; badges: number }>;
}

// プロジェクト内の全注釈ファイルを一括 renumber する。
// 本文の丸数字(①②…)との個数照合はマニュアル全体の合計で行うため、合計を返す
export function renumberAllBadgesFiles(projectRoot: string): RenumberAllResult {
  const annotationsDir = join(projectRoot, "annotations");
  const ids = existsSync(annotationsDir)
    ? readdirSync(annotationsDir)
        .filter((name) => name.endsWith(".json"))
        .map((name) => basename(name, ".json"))
    : [];
  const files = ids.map((id) => {
    const next = renumberBadgesFile(projectRoot, id);
    return { id, badges: countAnnotationBadges(next) };
  });
  return {
    totalBadges: files.reduce((sum, file) => sum + file.badges, 0),
    files,
  };
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
        locked: true,
        src: imageSrc,
        rect: { x: 0, y: 0, w: 100, h: 100 },
      },
    ],
  };
  writeAnnotationFile(projectRoot, id, annotation);
  return annotation;
}

export function addPastedImageObject(
  projectRoot: string,
  annotationId: string,
  objectId: string,
  buffer: Buffer,
  natural: { width: number; height: number },
): AnnotationFile {
  if (natural.width <= 0 || natural.height <= 0) {
    throw new Error("画像サイズは1px以上である必要があります");
  }
  const annotation = readAnnotationFile(projectRoot, annotationId);
  if (annotation.objects.some((obj) => obj.id === objectId)) {
    throw new Error(`オブジェクトIDが既に存在します: ${objectId}`);
  }

  const maxWidth = annotation.canvas.width * 0.5;
  const maxHeight = annotation.canvas.height * 0.5;
  const scale = Math.min(1, maxWidth / natural.width, maxHeight / natural.height);
  const displayWidth = natural.width * scale;
  const displayHeight = natural.height * scale;
  const widthPct = (displayWidth / annotation.canvas.width) * 100;
  const heightPct = (displayHeight / annotation.canvas.height) * 100;
  const src = `img/raw/${annotationId}-${objectId}.png`;
  const imagePath = join(projectRoot, src);
  if (existsSync(imagePath)) {
    throw new Error(`画像ファイルが既に存在します: ${src}`);
  }

  const next = parseAnnotation({
    ...annotation,
    objects: [
      ...annotation.objects,
      {
        id: objectId,
        type: "image",
        source: "manual",
        locked: false,
        src,
        rect: {
          x: (100 - widthPct) / 2,
          y: (100 - heightPct) / 2,
          w: widthPct,
          h: heightPct,
        },
        crop: { x: 0, y: 0, w: natural.width, h: natural.height },
      },
    ],
  });

  mkdirSync(dirname(imagePath), { recursive: true });
  writeFileSync(imagePath, buffer);
  try {
    writeAnnotationFile(projectRoot, annotationId, next);
  } catch (error) {
    unlinkSync(imagePath);
    throw error;
  }
  return next;
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
