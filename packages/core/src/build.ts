import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { imageSize } from "image-size";
import type { Code, Heading, Root as MdastRoot } from "mdast";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { parse as parseYaml } from "yaml";
import { readProjectTheme } from "./project.js";
import { escapeHtml, renderFigure, type RenderFenceOptions } from "./render.js";
import { parseAnnotation } from "./schema.js";
import { annotationThemeCss, THEME_CSS } from "./theme.js";

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

type NaturalSizeCache = Map<string, { w: number; h: number }>;

const IMG_SRC_RE = /src="(img\/[^"]+)"/g;

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

function resolveNaturalSizes(
  projectRoot: string,
  srcPaths: string[],
  cache?: NaturalSizeCache,
): Record<string, { w: number; h: number }> {
  const sizes: Record<string, { w: number; h: number }> = {};
  for (const src of srcPaths) {
    const cached = cache?.get(src);
    if (cached) {
      sizes[src] = cached;
      continue;
    }
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
    cache?.set(src, sizes[src]);
  }
  return sizes;
}

function copyImages(projectRoot: string, outputDir: string, srcPaths: string[]): void {
  mkdirSync(join(outputDir, "img"), { recursive: true });
  for (const src of srcPaths) {
    const sourcePath = join(projectRoot, src);
    if (!existsSync(sourcePath)) {
      throw new Error(`画像ファイルが見つかりません: ${src}`);
    }
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
  options: { dataAnnotationId?: boolean; sizeCache?: NaturalSizeCache } = {},
): string {
  const fence = parseAnnotatedImageFence(body);
  const annotation = loadAnnotation(projectRoot, fence.src);
  const imageSources = collectImageSources(annotation);
  const naturalSizes = resolveNaturalSizes(projectRoot, imageSources, options.sizeCache);
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

function headingText(node: Heading): string {
  let text = "";
  visit(node, (child) => {
    if ("value" in child && typeof child.value === "string") {
      text += child.value;
    }
  });
  return text.trim();
}

interface ProcessMarkdownOptions {
  dataAnnotationId?: boolean;
}

interface ProcessMarkdownResult {
  html: string;
  title: string;
  images: string[];
}

// annotated-image フェンスを mdast の code ノードとして検出して figure HTML に置換する。
// コードブロック内に書かれた「フェンスの例」は code ノードの value に留まるため誤展開されない
function annotatedImageTransformer(
  projectRoot: string,
  options: ProcessMarkdownOptions,
  out: { title?: string },
  sizeCache: NaturalSizeCache,
) {
  return (tree: MdastRoot) => {
    visit(tree, "heading", (node: Heading) => {
      if (node.depth === 1 && out.title === undefined) {
        out.title = headingText(node);
      }
    });
    visit(tree, "code", (node: Code) => {
      if (node.lang !== "annotated-image") {
        return;
      }
      const html = renderAnnotatedImageFence(projectRoot, node.value, {
        dataAnnotationId: options.dataAnnotationId,
        sizeCache,
      });
      const replacement = node as unknown as { type: string; lang?: string; value: string };
      replacement.type = "html";
      delete replacement.lang;
      replacement.value = html;
    });
  };
}

async function processMarkdown(
  projectRoot: string,
  markdown: string,
  options: ProcessMarkdownOptions = {},
): Promise<ProcessMarkdownResult> {
  const out: { title?: string } = {};
  const sizeCache: NaturalSizeCache = new Map();
  const processor = unified()
    .use(remarkParse)
    .use(() => annotatedImageTransformer(projectRoot, options, out, sizeCache))
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSlug)
    .use(rehypeStringify);

  const result = await processor.process(markdown);
  const html = String(result);
  const images = [...new Set([...html.matchAll(IMG_SRC_RE)].map((match) => match[1] as string))];
  return { html, title: out.title ?? "Manual", images };
}

function inlineImagesAsDataUri(html: string, outputDir: string): string {
  return html.replace(IMG_SRC_RE, (_match, srcPath: string) => {
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
  const outputDir = options.outputDir ?? join(projectRoot, "dist");
  mkdirSync(outputDir, { recursive: true });

  const { html: bodyHtml, title, images } = await processMarkdown(projectRoot, sourceMarkdown);

  copyImages(projectRoot, outputDir, images);

  let finalBodyHtml = bodyHtml;
  if (options.singleFile) {
    finalBodyHtml = inlineImagesAsDataUri(bodyHtml, outputDir);
  }

  const themeCss = annotationThemeCss(readProjectTheme(projectRoot));
  const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${THEME_CSS}${themeCss ? `\n${themeCss}` : ""}</style>
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
  const { html } = await processMarkdown(projectRoot, markdown, { dataAnnotationId: true });
  if (!options.rewriteImageSrc) {
    return html;
  }
  return html.replace(IMG_SRC_RE, (_match, srcPath: string) => {
    return `src="${options.rewriteImageSrc!(srcPath)}"`;
  });
}
