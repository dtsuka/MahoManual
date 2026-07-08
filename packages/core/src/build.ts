import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import imageSize from "image-size";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { parse as parseYaml } from "yaml";
import { renderFigure, type RenderFenceOptions } from "./render.js";
import { parseAnnotation } from "./schema.js";
import { THEME_CSS } from "./theme.js";

export interface BuildOptions {
  outputDir?: string;
  singleFile?: boolean;
}

export interface BuildResult {
  htmlPath: string;
  imgDir: string;
}

interface AnnotatedImageFence {
  src: string;
  width?: number;
  border?: boolean;
  alt?: string;
  caption?: string;
}

const ANNOTATED_IMAGE_FENCE_RE = /```annotated-image\n([\s\S]*?)```/g;

function extractTitle(markdown: string): string {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? "Manual";
}

function loadAnnotation(projectRoot: string, annotationId: string) {
  const annotationPath = join(projectRoot, "annotations", `${annotationId}.json`);
  if (!existsSync(annotationPath)) {
    throw new Error(`annotation file not found: ${annotationId}`);
  }
  const json = JSON.parse(readFileSync(annotationPath, "utf8"));
  return parseAnnotation(json);
}

function collectImageSources(annotation: ReturnType<typeof parseAnnotation>): string[] {
  return annotation.objects
    .filter((obj): obj is Extract<(typeof annotation.objects)[number], { type: "image" }> => obj.type === "image")
    .map((obj) => obj.src);
}

function resolveNaturalSizes(projectRoot: string, srcPaths: string[]): Record<string, { w: number; h: number }> {
  const sizes: Record<string, { w: number; h: number }> = {};
  for (const src of srcPaths) {
    const absolutePath = join(projectRoot, src);
    if (!existsSync(absolutePath)) {
      throw new Error(`image file not found: ${src}`);
    }
    const buffer = readFileSync(absolutePath);
    const size = imageSize(buffer);
    if (!size.width || !size.height) {
      throw new Error(`unable to read image size: ${src}`);
    }
    sizes[src] = { w: size.width, h: size.height };
  }
  return sizes;
}

function copyImages(projectRoot: string, outputDir: string, srcPaths: string[]): void {
  mkdirSync(join(outputDir, "img"), { recursive: true });
  for (const src of srcPaths) {
    const sourcePath = join(projectRoot, src);
    const destPath = join(outputDir, src);
    mkdirSync(dirname(destPath), { recursive: true });
    copyFileSync(sourcePath, destPath);
  }
}

function parseAnnotatedImageFence(value: string): AnnotatedImageFence {
  const parsed = parseYaml(value) as Partial<AnnotatedImageFence>;
  if (!parsed.src || typeof parsed.src !== "string") {
    throw new Error("annotated-image fence requires src");
  }
  return {
    src: parsed.src,
    width: parsed.width,
    border: parsed.border,
    alt: parsed.alt,
    caption: parsed.caption,
  };
}

function renderAnnotatedImageFence(
  projectRoot: string,
  body: string,
  options: { dataAnnotationId?: boolean } = {},
): string {
  const fence = parseAnnotatedImageFence(body);
  const annotation = loadAnnotation(projectRoot, fence.src);
  const imageSources = collectImageSources(annotation);
  const naturalSizes = resolveNaturalSizes(projectRoot, imageSources);
  const renderFence: RenderFenceOptions = {
    width: fence.width,
    border: fence.border,
    alt: fence.alt,
    caption: fence.caption,
  };
  let html = renderFigure(annotation, { naturalSizes, fence: renderFence });
  if (options.dataAnnotationId) {
    html = html.replace("<figure ", `<figure data-mm-annotation="${fence.src}" `);
  }
  return html;
}

export function getNaturalSizes(
  projectRoot: string,
  srcPaths: string[],
): Record<string, { w: number; h: number }> {
  return resolveNaturalSizes(projectRoot, srcPaths);
}

function expandAnnotatedImageFences(projectRoot: string, markdown: string): string {
  return markdown.replace(ANNOTATED_IMAGE_FENCE_RE, (_match, body: string) =>
    renderAnnotatedImageFence(projectRoot, body),
  );
}

function collectReferencedImages(projectRoot: string, markdown: string): string[] {
  const referenced = new Set<string>();
  for (const match of markdown.matchAll(ANNOTATED_IMAGE_FENCE_RE)) {
    const fence = parseAnnotatedImageFence(match[1] ?? "");
    const annotation = loadAnnotation(projectRoot, fence.src);
    for (const src of collectImageSources(annotation)) {
      referenced.add(src);
    }
  }
  return [...referenced];
}

async function markdownToHtml(markdown: string): Promise<string> {
  const processor = unified()
    .use(remarkParse)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSlug)
    .use(rehypeStringify);

  const result = await processor.process(markdown);
  return String(result);
}

function inlineImagesAsDataUri(html: string, outputDir: string): string {
  return html.replace(/src="(img\/[^"]+)"/g, (_match, srcPath: string) => {
    const absolutePath = join(outputDir, srcPath);
    const buffer = readFileSync(absolutePath);
    const ext = srcPath.split(".").pop()?.toLowerCase() ?? "png";
    const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
    const base64 = buffer.toString("base64");
    return `src="data:${mime};base64,${base64}"`;
  });
}

export async function buildProject(projectRoot: string, options: BuildOptions = {}): Promise<BuildResult> {
  const manualPath = join(projectRoot, "manual.md");
  if (!existsSync(manualPath)) {
    throw new Error(`manual.md not found in ${projectRoot}`);
  }

  const sourceMarkdown = readFileSync(manualPath, "utf8");
  const title = extractTitle(sourceMarkdown);
  const outputDir = options.outputDir ?? join(projectRoot, "dist");
  mkdirSync(outputDir, { recursive: true });

  const expandedMarkdown = expandAnnotatedImageFences(projectRoot, sourceMarkdown);
  const bodyHtml = await markdownToHtml(expandedMarkdown);

  copyImages(projectRoot, outputDir, collectReferencedImages(projectRoot, sourceMarkdown));

  let finalBodyHtml = bodyHtml;
  if (options.singleFile) {
    finalBodyHtml = inlineImagesAsDataUri(bodyHtml, outputDir);
  }

  const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>${THEME_CSS}</style>
</head>
<body>
${finalBodyHtml}
</body>
</html>`;

  const htmlPath = join(outputDir, "manual.html");
  writeFileSync(htmlPath, html, "utf8");

  return {
    htmlPath,
    imgDir: join(outputDir, "img"),
  };
}

export interface PreviewOptions {
  rewriteImageSrc?: (src: string) => string;
}

export async function buildPreviewHtml(
  projectRoot: string,
  markdown: string,
  options: PreviewOptions = {},
): Promise<string> {
  const expandedMarkdown = markdown.replace(ANNOTATED_IMAGE_FENCE_RE, (_match, body: string) =>
    renderAnnotatedImageFence(projectRoot, body, { dataAnnotationId: true }),
  );
  let bodyHtml = await markdownToHtml(expandedMarkdown);
  if (options.rewriteImageSrc) {
    bodyHtml = bodyHtml.replace(/src="(img\/[^"]+)"/g, (_match, srcPath: string) => {
      return `src="${options.rewriteImageSrc!(srcPath)}"`;
    });
  }
  return bodyHtml;
}
