import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { imageSize } from "image-size";
import sharp from "sharp";
import type { Code, Heading, Html, Root as MdastRoot } from "mdast";
import GithubSlugger from "github-slugger";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { parse as parseYaml } from "yaml";
import { collectImageSources } from "./annotation-objects.js";
import { readProjectTheme } from "./project.js";
import { annotationFilePath, resolveInside } from "./safe-name.js";
import { escapeHtml, renderFigure, type RenderFenceOptions } from "./render.js";
import { parseAnnotation } from "./schema.js";
import { annotationThemeCss, THEME_CSS, THEME_FONT_LINKS_HTML } from "./theme.js";
import { applyMosaicsToImage } from "./mosaic.js";
import type { AnnotationFile, AnnotationObject } from "./schema.js";

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

interface PixelCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface CroppedImageJob {
  source: string;
  output: string;
  crop: PixelCrop;
  annotation: AnnotationFile;
  image: Extract<AnnotationObject, { type: "image" }>;
}

// 単一ファイル出力の data URI に使う拡張子ごとの MIME タイプ
const IMAGE_MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
};

// hast の要素ノード(必要な部分だけ)
interface HastElement {
  type: "element";
  tagName: string;
  properties?: Record<string, unknown>;
}
const TOC_MARKER = "<!-- toc -->";

function loadAnnotation(projectRoot: string, annotationId: string) {
  const annotationPath = annotationFilePath(projectRoot, annotationId);
  if (!existsSync(annotationPath)) {
    throw new Error(`annotation file not found: ${annotationId}`);
  }
  const json = JSON.parse(readFileSync(annotationPath, "utf8"));
  return parseAnnotation(json);
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
    const absolutePath = resolveInside(projectRoot, src);
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
    const sourcePath = resolveInside(projectRoot, src);
    if (!existsSync(sourcePath)) {
      throw new Error(`画像ファイルが見つかりません: ${src}`);
    }
    const destPath = resolveInside(outputDir, src);
    mkdirSync(dirname(destPath), { recursive: true });
    copyFileSync(sourcePath, destPath);
  }
}

import { validateCrop } from "./crop-math.js";

async function writeCroppedImages(
  projectRoot: string,
  outputDir: string,
  jobs: CroppedImageJob[],
): Promise<void> {
  const uniqueJobs = new Map(jobs.map((job) => [job.output, job]));
  await Promise.all(
    [...uniqueJobs.values()].map(async ({ source, output, crop, annotation, image }) => {
      const destinationPath = resolveInside(outputDir, output);
      mkdirSync(dirname(destinationPath), { recursive: true });
      const mosaicked = await applyMosaicsToImage(
        readFileSync(resolveInside(projectRoot, source)),
        annotation,
        image,
      );
      await sharp(mosaicked)
        .extract({ left: crop.x, top: crop.y, width: crop.w, height: crop.h })
        .png()
        .toFile(destinationPath);
    }),
  );
}

function removeStaleAnnotatedSources(
  outputDir: string,
  jobs: CroppedImageJob[],
  outputImages: string[],
): void {
  const copiedImages = new Set(outputImages);
  for (const source of new Set(jobs.map((job) => job.source))) {
    if (!copiedImages.has(source)) {
      rmSync(resolveInside(outputDir, source), { force: true });
    }
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
  options: {
    dataAnnotationId?: boolean;
    sizeCache?: NaturalSizeCache;
    croppedImages?: CroppedImageJob[];
  } = {},
): string {
  const fence = parseAnnotatedImageFence(body);
  const annotation = loadAnnotation(projectRoot, fence.src);
  const imageSources = collectImageSources(annotation);
  const naturalSizes = resolveNaturalSizes(projectRoot, imageSources, options.sizeCache);
  let renderAnnotation = annotation;
  let renderNaturalSizes = naturalSizes;

  if (options.croppedImages) {
    const croppedNaturalSizes: Record<string, { w: number; h: number }> = {};
    const deliveryObjects: AnnotationObject[] = [];
    for (const obj of annotation.objects) {
      if (obj.type === "mosaic") {
        continue;
      }
      if (obj.type !== "image") {
        deliveryObjects.push(obj);
        continue;
      }
      const crop = validateCrop(
        obj.crop ?? { x: 0, y: 0, w: naturalSizes[obj.src]!.w, h: naturalSizes[obj.src]!.h },
        naturalSizes[obj.src]!,
        obj.src,
      );
      const output = `img/cropped/${fence.src}/${obj.id}.png`;
      options.croppedImages.push({
        source: obj.src,
        output,
        crop,
        annotation,
        image: obj,
      });
      croppedNaturalSizes[output] = { w: crop.w, h: crop.h };
      deliveryObjects.push({ ...obj, src: output, crop: undefined });
    }
    renderAnnotation = {
      ...annotation,
      objects: deliveryObjects,
    };
    renderNaturalSizes = croppedNaturalSizes;
  }
  const renderFence: RenderFenceOptions = {
    width: fence.width,
    border: fence.border,
    alt: fence.alt,
    caption: fence.caption,
  };
  let html = renderFigure(renderAnnotation, { naturalSizes: renderNaturalSizes, fence: renderFence });
  if (options.dataAnnotationId) {
    html = html.replace("<figure ", `<figure data-mm-annotation="${escapeHtml(fence.src)}" `);
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

function renderTocHtml(entries: { text: string; slug: string }[]): string {
  const items = entries
    .map(({ text, slug }) => `    <li><a href="#${escapeHtml(slug)}">${escapeHtml(text)}</a></li>`)
    .join("\n");
  return `<nav class="mm-toc">\n  <ul>\n${items}\n  </ul>\n</nav>`;
}

// <!-- toc --> マーカーを H2 のみの目次 HTML に展開する。
// slug は rehype-slug と同じ github-slugger で全見出しを文書順に採番する。
function tocTransformer() {
  return (tree: MdastRoot) => {
    const slugger = new GithubSlugger();
    const h2Entries: { text: string; slug: string }[] = [];

    visit(tree, "heading", (node: Heading) => {
      const text = headingText(node);
      const slug = slugger.slug(text);
      if (node.depth === 2) {
        h2Entries.push({ text, slug });
      }
    });

    if (h2Entries.length === 0) {
      return;
    }

    visit(tree, "html", (node: Html) => {
      if (node.value.trim() === TOC_MARKER) {
        node.value = renderTocHtml(h2Entries);
      }
    });
  };
}

interface ProcessMarkdownOptions {
  dataAnnotationId?: boolean;
  cropImages?: boolean;
}

interface ProcessMarkdownResult {
  title: string;
  images: string[];
  croppedImages: CroppedImageJob[];
  // 本文HTMLを返す。rewriteImageSrc を渡すとプロジェクト内画像の <img src> をその戻り値に置き換える
  renderHtml: (rewriteImageSrc?: (src: string) => string) => string;
}

// <img src> の値を、プロジェクトのフォルダを基準にした正規化済みパスにする。
// img/ 以下を指すもの以外(URL・data URI・ページ内リンクなど)は null。プロジェクトの外を指す場合はエラー
function projectImagePath(src: string): string | null {
  if (src.length === 0 || src.startsWith("/") || src.startsWith("#") || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(src)) {
    return null;
  }
  const path = src.replace(/[?#].*$/, "");
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    // 不正なエスケープはそのまま扱う
  }
  const normalized = resolveInside("", decoded);
  return normalized.startsWith("img/") ? normalized : null;
}

// rehype の木から <img> 要素を集め、src を正規化済みパスへ書き換える。
// HTML文字列を正規表現で探さないため、コードブロック内の `<img src=...>` という文字列は対象にならない
function collectImageElements(found: Array<{ node: HastElement; src: string }>) {
  return (tree: unknown) => {
    visit(tree as Parameters<typeof visit>[0], "element", (node) => {
      const element = node as unknown as HastElement;
      const src = element.properties?.src;
      if (element.tagName !== "img" || typeof src !== "string") {
        return;
      }
      const path = projectImagePath(src);
      if (path === null) {
        return;
      }
      element.properties = { ...element.properties, src: path };
      found.push({ node: element, src: path });
    });
  };
}

// annotated-image フェンスを mdast の code ノードとして検出して figure HTML に置換する。
// コードブロック内に書かれた「フェンスの例」は code ノードの value に留まるため誤展開されない
function annotatedImageTransformer(
  projectRoot: string,
  options: ProcessMarkdownOptions,
  out: { title?: string },
  sizeCache: NaturalSizeCache,
  croppedImages: CroppedImageJob[],
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
        croppedImages: options.cropImages ? croppedImages : undefined,
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
  const croppedImages: CroppedImageJob[] = [];
  const imageElements: Array<{ node: HastElement; src: string }> = [];
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(() => tocTransformer())
    .use(() => annotatedImageTransformer(projectRoot, options, out, sizeCache, croppedImages))
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSlug)
    .use(() => collectImageElements(imageElements));

  const tree = await processor.run(processor.parse(markdown));
  const images = [...new Set(imageElements.map((item) => item.src))];
  const renderHtml = (rewriteImageSrc?: (src: string) => string): string => {
    for (const { node, src } of imageElements) {
      node.properties = { ...node.properties, src: rewriteImageSrc ? rewriteImageSrc(src) : src };
    }
    const stringifier = unified().use(rehypeStringify);
    return stringifier.stringify(tree as Parameters<typeof stringifier.stringify>[0]);
  };
  return { title: out.title ?? "Manual", images, croppedImages, renderHtml };
}

function imageDataUri(outputDir: string, srcPath: string): string {
  const buffer = readFileSync(resolveInside(outputDir, srcPath));
  const ext = extname(srcPath).slice(1).toLowerCase();
  const mime = IMAGE_MIME_TYPES[ext] ?? "application/octet-stream";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

// プロジェクトの元データを置くフォルダ(ビルドの出力先にしてはいけない)
const SOURCE_FOLDERS = ["img", "annotations", "captures", ".auth"];

// シンボリックリンクを解決した絶対パス。まだ無いフォルダは、存在する親までを解決して残りをつなぐ
function realPathOf(path: string): string {
  const absolute = resolve(path);
  const rest: string[] = [];
  let current = absolute;
  for (;;) {
    try {
      return join(realpathSync(current), ...rest.reverse());
    } catch {
      const parent = dirname(current);
      if (parent === current) {
        return absolute;
      }
      rest.push(basename(current));
      current = parent;
    }
  }
}

function isSameOrInside(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

// 出力先がプロジェクトのフォルダ自体・それを含むフォルダ・元データのフォルダだと、
// 出力時の上書きや古い画像の削除で元のスクショを消してしまうため拒否する
function assertOutputDirOutsideSources(projectRoot: string, outputDir: string): void {
  const project = realPathOf(projectRoot);
  const output = realPathOf(outputDir);
  const overlapsSource = SOURCE_FOLDERS.some((folder) => isSameOrInside(output, join(project, folder)));
  if (isSameOrInside(project, output) || overlapsSource) {
    throw new Error(
      `出力先にプロジェクトのフォルダ自体・それを含むフォルダ・元データのフォルダ(${SOURCE_FOLDERS.join(", ")})は指定できません: ${outputDir}`,
    );
  }
}

export async function buildProject(projectRoot: string, options: BuildOptions = {}): Promise<BuildResult> {
  const manualPath = join(projectRoot, "manual.md");
  if (!existsSync(manualPath)) {
    throw new Error(`manual.md not found in ${projectRoot}`);
  }

  const sourceMarkdown = readFileSync(manualPath, "utf8");
  const outputDir = options.outputDir ?? join(projectRoot, "dist");
  assertOutputDirOutsideSources(projectRoot, outputDir);
  mkdirSync(outputDir, { recursive: true });

  const { renderHtml, title, images, croppedImages } = await processMarkdown(projectRoot, sourceMarkdown, {
    cropImages: true,
  });

  await writeCroppedImages(projectRoot, outputDir, croppedImages);
  const croppedPaths = new Set(croppedImages.map((job) => job.output));
  const copiedImages = images.filter((src) => !croppedPaths.has(src));
  const protectedSources = new Set(croppedImages
    .filter((job) => job.annotation.objects.some(
      (obj) => obj.type === "mosaic" && obj.targetImageId === job.image.id,
    ))
    .map((job) => job.source));
  const unsafePlainReference = copiedImages.find((src) => protectedSources.has(src));
  if (unsafePlainReference) {
    throw new Error(
      `モザイク対象の元画像を通常画像として同時に納品できません: ${unsafePlainReference}`,
    );
  }
  copyImages(projectRoot, outputDir, copiedImages);
  removeStaleAnnotatedSources(outputDir, croppedImages, copiedImages);

  const finalBodyHtml = options.singleFile
    ? renderHtml((src) => imageDataUri(outputDir, src))
    : renderHtml();

  const themeCss = annotationThemeCss(readProjectTheme(projectRoot));
  const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  ${THEME_FONT_LINKS_HTML}
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
  const { renderHtml } = await processMarkdown(projectRoot, markdown, { dataAnnotationId: true });
  return renderHtml(options.rewriteImageSrc);
}
