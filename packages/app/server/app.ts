import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { extname, join, sep } from "node:path";
import {
  annotationFilePath,
  buildPreviewHtml,
  collectImageSources,
  getNaturalSizes,
  ImageOperationError,
  importPastedImage,
  isSafeName,
  isSafeRelativePath,
  parseAnnotation,
  renderAnnotationPng,
  renderManualHtmlDownload,
  renderManualPdfDownload,
  renumberBadges,
  replaceImageObject,
  resolveInside,
  updateProjectTheme,
  writeAnnotationFileAtomic,
  writeFileAtomic,
} from "@mahomanual/core";
import {
  countAnnotationBadges,
  countUnicodeBadges,
  addPastedImageObject,
  createManualProject,
  listManuals,
  normalizeProjectTitle,
  readAnnotationFile,
  readAnnotationDefaults,
  readManual,
  readProjectOutputFilenames,
  readProjectTheme,
  readProjectTitle,
  renameAnnotationId,
  renumberAllBadgesFiles,
  writeAnnotationFile,
  writeProjectOutputFilenames,
  writeProjectTitle,
} from "@mahomanual/core/project";
import { Hono } from "hono";
import type { Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { projectFileUrl, projectsDir as defaultProjectsDir } from "./paths.js";
import { parseUploadedImage } from "./parse-uploaded-image.js";
import { createWatchHandler } from "./watch.js";

import type { AnnotationFile } from "@mahomanual/core";

/**
 * リクエスト本文の上限(30MB)。画像は base64 の data URI で送るため、
 * 元の画像ファイルでおよそ 22MB までを受け付ける
 */
export const MAX_REQUEST_BODY_BYTES = 30 * 1024 * 1024;

export interface CreateAppOptions {
  /** プロジェクト置き場。省略時はリポジトリの projects/ */
  projectsDir?: string;
}

// ローカル専用ツール: ブラウザ上の別サイトからの書き込み(CSRF)と
// DNS リバインディングを防ぐため、localhost 系の Host / Origin のみ許可する
const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/i;
const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/i;
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const JSON_CONTENT_TYPE_RE = /^application\/json\s*(;|$)/i;

function outputFilenames(root: string, project: string) {
  return readProjectOutputFilenames(root, {
    html: `${project}.html`,
    pdf: `${project}.pdf`,
  });
}

// RFC 5987 の attr-char 以外をすべて %XX にする(encodeURIComponent は ' ( ) * を残すため補う)
function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * Content-Disposition。ASCII 以外を含む名前は、ASCII の代替名(filename)と
 * UTF-8 の正式名(filename*)を併記する。ヘッダー値に ASCII 以外を入れると Node が例外を投げる
 */
export function attachmentHeader(filename: string, fallbackBase: string): string {
  if (/^[\x20-\x7e]+$/.test(filename) && !/["\\]/.test(filename)) {
    return `attachment; filename="${filename}"`;
  }
  const toAscii = (value: string) => value.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const extension = toAscii(extname(filename));
  const base = toAscii(filename.slice(0, filename.length - extname(filename).length));
  const ascii = /[A-Za-z0-9]/.test(base) ? `${base}${extension}` : `${fallbackBase}${extension}`;
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeRfc5987(filename)}`;
}

/**
 * JSON本文を読み、オブジェクトであることを確かめる。
 * Content-Type が application/json でなければ 415、JSONとして壊れている・オブジェクトでなければ 400
 */
async function readJsonObject(c: Context): Promise<Record<string, unknown>> {
  if (!JSON_CONTENT_TYPE_RE.test(c.req.header("content-type") ?? "")) {
    throw new HTTPException(415, { message: "Content-Type: application/json で送信してください" });
  }
  const text = await c.req.text();
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new HTTPException(400, { message: "リクエスト本文をJSONとして読み込めません" });
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new HTTPException(400, { message: "リクエスト本文はJSONオブジェクトで指定してください" });
  }
  return value as Record<string, unknown>;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

const IMAGE_ERROR_STATUS: Record<ImageOperationError["reason"], ContentfulStatusCode> = {
  "not-found": 404,
  locked: 409,
  conflict: 409,
  invalid: 400,
};

function imageErrorResponse(c: Context, error: unknown, fallback: string) {
  if (error instanceof ImageOperationError) {
    return c.json({ error: error.message }, IMAGE_ERROR_STATUS[error.reason]);
  }
  const message = errorMessage(error, fallback);
  return c.json({ error: message }, message.includes("既に存在") ? 409 : 400);
}

function annotationPayload(root: string, annotation: AnnotationFile) {
  return {
    annotation,
    naturalSizes: getNaturalSizes(root, collectImageSources(annotation)),
    theme: readProjectTheme(root),
    defaults: readAnnotationDefaults(root),
  };
}

function mimeType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

export function createApp(options: CreateAppOptions = {}) {
  const projectsDir = options.projectsDir ?? defaultProjectsDir;
  const app = new Hono();

  function resolveProject(name: string): string | null {
    if (!isSafeName(name)) {
      return null;
    }
    const root = join(projectsDir, name);
    if (!existsSync(join(root, "manual.md"))) {
      return null;
    }
    return root;
  }

  app.onError((error, c) => {
    if (error instanceof HTTPException) {
      return c.json({ error: error.message || "request failed" }, error.status);
    }
    console.error(error);
    return c.json({ error: errorMessage(error, "internal server error") }, 500);
  });

  app.notFound((c) => c.json({ error: "not found" }, 404));

  // Host / Origin / Sec-Fetch-Site の検査(SPEC §11 ローカルサーバーの安全対策)
  app.use("/api/*", async (c, next) => {
    const host = c.req.header("host") ?? new URL(c.req.url).host;
    if (!LOCAL_HOST_RE.test(host)) {
      return c.json({ error: "localhost 以外のホスト名からのアクセスは受け付けません" }, 403);
    }
    if (UNSAFE_METHODS.has(c.req.method)) {
      const origin = c.req.header("origin");
      if (origin !== undefined && !LOCAL_ORIGIN_RE.test(origin)) {
        return c.json({ error: "別のサイトからの変更は受け付けません" }, 403);
      }
      if (c.req.header("sec-fetch-site") === "cross-site") {
        return c.json({ error: "別のサイトからの変更は受け付けません" }, 403);
      }
    }
    await next();
  });

  app.use(
    "/api/*",
    cors({
      origin: (origin) => (LOCAL_ORIGIN_RE.test(origin) ? origin : null),
    }),
  );

  app.use(
    "/api/*",
    bodyLimit({
      maxSize: MAX_REQUEST_BODY_BYTES,
      onError: (c) =>
        c.json(
          { error: `リクエストが大きすぎます(上限 ${MAX_REQUEST_BODY_BYTES / 1024 / 1024}MB)` },
          413,
        ),
    }),
  );

  app.get("/api/projects", (c) => {
    return c.json(listManuals(projectsDir));
  });

  app.post("/api/projects", async (c) => {
    const body = await readJsonObject(c);
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!isSafeName(id)) {
      return c.json({ error: "不正なプロジェクトIDです" }, 400);
    }
    if (body.title != null && typeof body.title !== "string") {
      return c.json({ error: "titleは文字列で指定してください" }, 400);
    }
    const title = normalizeProjectTitle(typeof body.title === "string" ? body.title : "", id);
    try {
      const root = createManualProject(projectsDir, id, title);
      return c.json({ id, title: readProjectTitle(root, id) }, 201);
    } catch (error) {
      const message = errorMessage(error, "project creation failed");
      return c.json({ error: message }, message.includes("既に存在") ? 409 : 400);
    }
  });

  app.get("/api/projects/:project/export.html", async (c) => {
    const project = c.req.param("project");
    const root = resolveProject(project);
    if (!root) {
      return c.json({ error: "project not found" }, 404);
    }
    try {
      const html = await renderManualHtmlDownload(root);
      const filename = outputFilenames(root, project).html;
      return c.body(html.toString("utf8"), 200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": attachmentHeader(filename, "manual"),
        "Cache-Control": "no-store",
      });
    } catch (error) {
      return c.json({ error: errorMessage(error, "HTML export failed") }, 500);
    }
  });

  app.get("/api/projects/:project/export.pdf", async (c) => {
    const project = c.req.param("project");
    const root = resolveProject(project);
    if (!root) {
      return c.json({ error: "project not found" }, 404);
    }
    try {
      const pdf = await renderManualPdfDownload(root);
      const filename = outputFilenames(root, project).pdf;
      return c.body(Uint8Array.from(pdf), 200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": attachmentHeader(filename, "manual"),
        "Cache-Control": "no-store",
      });
    } catch (error) {
      return c.json({ error: errorMessage(error, "PDF export failed") }, 500);
    }
  });

  app.get("/api/projects/:project/output", (c) => {
    const project = c.req.param("project");
    const root = resolveProject(project);
    if (!root) {
      return c.json({ error: "project not found" }, 404);
    }
    return c.json(outputFilenames(root, project));
  });

  app.put("/api/projects/:project/output", async (c) => {
    const root = resolveProject(c.req.param("project"));
    if (!root) {
      return c.json({ error: "project not found" }, 404);
    }
    const body = await readJsonObject(c);
    if (typeof body.html !== "string" || typeof body.pdf !== "string") {
      return c.json({ error: "HTML/PDFファイル名を文字列で指定してください" }, 400);
    }
    try {
      return c.json(writeProjectOutputFilenames(root, { html: body.html, pdf: body.pdf }));
    } catch (error) {
      return c.json({ error: errorMessage(error, "output update failed") }, 400);
    }
  });

  app.get("/api/projects/:project/title", (c) => {
    const project = c.req.param("project");
    const root = resolveProject(project);
    if (!root) {
      return c.json({ error: "project not found" }, 404);
    }
    return c.json({ name: project, title: readProjectTitle(root, project) });
  });

  app.put("/api/projects/:project/title", async (c) => {
    const project = c.req.param("project");
    const root = resolveProject(project);
    if (!root) {
      return c.json({ error: "project not found" }, 404);
    }
    const body = await readJsonObject(c);
    if (typeof body.title !== "string") {
      return c.json({ error: "titleは文字列で指定してください" }, 400);
    }
    return c.json({
      name: project,
      title: writeProjectTitle(root, body.title, project),
    });
  });

  app.get("/api/projects/:project/manual", (c) => {
    const root = resolveProject(c.req.param("project"));
    if (!root) {
      return c.json({ error: "project not found" }, 404);
    }
    const manual = readManual(root);
    return c.json(manual);
  });

  app.put("/api/projects/:project/manual", async (c) => {
    const root = resolveProject(c.req.param("project"));
    if (!root) {
      return c.json({ error: "project not found" }, 404);
    }
    const body = await readJsonObject(c);
    if (typeof body.body !== "string") {
      return c.json({ error: "body is required" }, 400);
    }
    writeFileAtomic(join(root, "manual.md"), body.body);
    return c.json({ ok: true });
  });

  app.get("/api/projects/:project/theme", (c) => {
    const root = resolveProject(c.req.param("project"));
    if (!root) {
      return c.json({ error: "project not found" }, 404);
    }
    return c.json({ theme: readProjectTheme(root), defaults: readAnnotationDefaults(root) });
  });

  // 注釈の既定テーマを更新する。color / fontSize の省略(または null)は「既定値に戻す」。
  // defaults は省略で変更なし、null または {} で種類別の既定値をすべて消す
  app.put("/api/projects/:project/theme", async (c) => {
    const root = resolveProject(c.req.param("project"));
    if (!root) {
      return c.json({ error: "project not found" }, 404);
    }
    const body = await readJsonObject(c);
    if (body.color != null && typeof body.color !== "string") {
      return c.json({ error: "colorは文字列で指定してください" }, 400);
    }
    if (body.fontSize != null && typeof body.fontSize !== "number") {
      return c.json({ error: "fontSizeは数値で指定してください" }, 400);
    }
    try {
      return c.json(
        updateProjectTheme(root, {
          color: (body.color as string | null | undefined) ?? undefined,
          fontSize: (body.fontSize as number | null | undefined) ?? undefined,
          defaults: body.defaults,
        }),
      );
    } catch (error) {
      return c.json({ error: errorMessage(error, "theme update failed") }, 400);
    }
  });

  app.get("/api/projects/:project/annotations/:id", (c) => {
    const project = c.req.param("project");
    const id = c.req.param("id");
    const root = resolveProject(project);
    if (!root) {
      return c.json({ error: "project not found" }, 404);
    }
    if (!isSafeName(id)) {
      return c.json({ error: "不正な注釈IDです" }, 400);
    }
    try {
      return c.json(annotationPayload(root, readAnnotationFile(root, id)));
    } catch (error) {
      return c.json({ error: errorMessage(error, "not found") }, 404);
    }
  });

  app.get("/api/projects/:project/annotations/:id/image.png", async (c) => {
    const project = c.req.param("project");
    const id = c.req.param("id");
    const root = resolveProject(project);
    if (!root) {
      return c.json({ error: "project not found" }, 404);
    }
    if (!isSafeName(id)) {
      return c.json({ error: "不正な注釈IDです" }, 400);
    }
    try {
      const annotation = readAnnotationFile(root, id);
      const png = await renderAnnotationPng(root, annotation);
      return c.body(Uint8Array.from(png), 200, {
        "Content-Type": "image/png",
        "Content-Disposition": attachmentHeader(`${id}.png`, "annotation"),
        "Cache-Control": "no-store",
      });
    } catch (error) {
      return c.json({ error: errorMessage(error, "image export failed") }, 500);
    }
  });

  app.put("/api/projects/:project/annotations/:id", async (c) => {
    const project = c.req.param("project");
    const id = c.req.param("id");
    const root = resolveProject(project);
    if (!root) {
      return c.json({ error: "project not found" }, 404);
    }
    if (!isSafeName(id)) {
      return c.json({ error: "不正な注釈IDです" }, 400);
    }
    const body = await readJsonObject(c);
    try {
      const annotation = writeAnnotationFileAtomic(root, id, parseAnnotation(body));
      return c.json({ annotation });
    } catch (error) {
      return c.json({ error: errorMessage(error, "validation failed") }, 400);
    }
  });

  app.patch("/api/projects/:project/annotations/:id/id", async (c) => {
    const project = c.req.param("project");
    const currentId = c.req.param("id");
    const root = resolveProject(project);
    if (!root) {
      return c.json({ error: "project not found" }, 404);
    }
    const body = await readJsonObject(c);
    const nextId = typeof body.id === "string" ? body.id.trim() : "";
    if (!isSafeName(currentId) || !isSafeName(nextId)) {
      return c.json({ error: "不正な画像IDです" }, 400);
    }
    if (existsSync(annotationFilePath(root, nextId)) && nextId !== currentId) {
      return c.json({ error: `注釈IDが既に存在します: ${nextId}` }, 409);
    }
    try {
      const annotation = renameAnnotationId(root, currentId, nextId);
      return c.json({ id: nextId, annotation });
    } catch (error) {
      const message = errorMessage(error, "rename failed");
      return c.json({ error: message }, message.includes("既に存在") ? 409 : 400);
    }
  });

  app.post("/api/projects/:project/annotations/:id/renumber", (c) => {
    const project = c.req.param("project");
    const id = c.req.param("id");
    const root = resolveProject(project);
    if (!root) {
      return c.json({ error: "project not found" }, 404);
    }
    if (!isSafeName(id)) {
      return c.json({ error: "不正な注釈IDです" }, 400);
    }
    try {
      const annotation = readAnnotationFile(root, id);
      const renumbered = renumberBadges(annotation);
      writeAnnotationFile(root, id, renumbered);
      const manualBody = readFileSync(join(root, "manual.md"), "utf8");
      const unicodeCount = countUnicodeBadges(manualBody);
      const badgeCount = countAnnotationBadges(renumbered);
      const warning =
        unicodeCount !== badgeCount
          ? `Unicode丸数字(${unicodeCount}個)とbadge(${badgeCount}個)の数が一致しません`
          : null;
      return c.json({ annotation: renumbered, warning });
    } catch (error) {
      return c.json({ error: errorMessage(error, "renumber failed") }, 400);
    }
  });

  // 全注釈ファイルの badge を一括 renumber し、本文の丸数字合計と照合する
  app.post("/api/projects/:project/renumber", (c) => {
    const project = c.req.param("project");
    const root = resolveProject(project);
    if (!root) {
      return c.json({ error: "project not found" }, 404);
    }
    try {
      const result = renumberAllBadgesFiles(root);
      const manualBody = readFileSync(join(root, "manual.md"), "utf8");
      const unicodeCount = countUnicodeBadges(manualBody);
      const warning =
        unicodeCount !== result.totalBadges
          ? `本文のUnicode丸数字(${unicodeCount}個)と全注釈のbadge合計(${result.totalBadges}個)が一致しません`
          : null;
      return c.json({ ...result, warning });
    } catch (error) {
      return c.json({ error: errorMessage(error, "renumber failed") }, 400);
    }
  });

  // 画像を取り込み、注釈JSONの雛形を作る。キャンバスは画像の実サイズ
  app.post("/api/projects/:project/images", async (c) => {
    const project = c.req.param("project");
    const root = resolveProject(project);
    if (!root) {
      return c.json({ error: "project not found" }, 404);
    }
    const body = await readJsonObject(c);
    if (typeof body.id !== "string" || typeof body.data !== "string" || !body.id || !body.data) {
      return c.json({ error: "id と data を文字列で指定してください" }, 400);
    }
    const id = body.id;
    if (!isSafeName(id)) {
      return c.json({ error: "不正な画像IDです" }, 400);
    }
    // 既存の注釈を雛形で黙って上書きしない
    if (existsSync(annotationFilePath(root, id))) {
      return c.json({ error: `注釈IDが既に存在します: ${id}` }, 409);
    }
    const parsed = parseUploadedImage(body.data);
    if (!parsed.ok) {
      return c.json({ error: parsed.error }, 400);
    }
    try {
      const result = importPastedImage(root, id, parsed.buffer, {
        width: parsed.width,
        height: parsed.height,
      });
      return c.json({
        id,
        imagePath: result.imagePath,
        annotation: result.annotation,
      });
    } catch (error) {
      return imageErrorResponse(c, error, "save failed");
    }
  });

  app.post("/api/projects/:project/annotations/:id/images", async (c) => {
    const project = c.req.param("project");
    const id = c.req.param("id");
    const root = resolveProject(project);
    if (!root) {
      return c.json({ error: "project not found" }, 404);
    }
    const body = await readJsonObject(c);
    if (typeof body.objectId !== "string" || !isSafeName(id) || !isSafeName(body.objectId)) {
      return c.json({ error: "不正なIDです" }, 400);
    }
    if (!existsSync(annotationFilePath(root, id))) {
      return c.json({ error: `注釈ファイルが見つかりません: ${id}` }, 404);
    }
    const parsed = parseUploadedImage(body.data);
    if (!parsed.ok) {
      return c.json({ error: parsed.error }, 400);
    }
    try {
      const annotation = addPastedImageObject(root, id, body.objectId, parsed.buffer, {
        width: parsed.width,
        height: parsed.height,
      });
      return c.json(annotationPayload(root, annotation), 201);
    } catch (error) {
      return imageErrorResponse(c, error, "画像追加に失敗しました");
    }
  });

  app.put("/api/projects/:project/annotations/:id/images/:objectId", async (c) => {
    const project = c.req.param("project");
    const id = c.req.param("id");
    const objectId = c.req.param("objectId");
    const root = resolveProject(project);
    if (!root) {
      return c.json({ error: "project not found" }, 404);
    }
    if (!isSafeName(id) || !isSafeName(objectId)) {
      return c.json({ error: "不正なIDです" }, 400);
    }
    const body = await readJsonObject(c);
    const parsed = parseUploadedImage(body.data);
    if (!parsed.ok) {
      return c.json({ error: parsed.error }, 400);
    }
    try {
      const annotation = replaceImageObject(root, id, objectId, parsed.buffer, {
        width: parsed.width,
        height: parsed.height,
      });
      return c.json(annotationPayload(root, annotation));
    } catch (error) {
      return imageErrorResponse(c, error, "replace failed");
    }
  });

  app.post("/api/projects/:project/preview", async (c) => {
    const project = c.req.param("project");
    const root = resolveProject(project);
    if (!root) {
      return c.json({ error: "project not found" }, 404);
    }
    const body = await readJsonObject(c);
    if (typeof body.markdown !== "string") {
      return c.json({ error: "markdown is required" }, 400);
    }
    try {
      const html = await buildPreviewHtml(root, body.markdown, {
        rewriteImageSrc: (src) => projectFileUrl(project, src),
      });
      return c.json({ html, theme: readProjectTheme(root) });
    } catch (error) {
      return c.json({ error: errorMessage(error, "preview failed") }, 400);
    }
  });

  // プロジェクト内のファイル(画像)を配信する。
  // `.` で始まるパス(.auth/ など)・フォルダ・プロジェクト外を指すシンボリックリンクは配信しない
  app.get("/api/projects/:project/files/:path{.+}", (c) => {
    const notFound = () => c.json({ error: "file not found" }, 404);
    const root = resolveProject(c.req.param("project"));
    if (!root) {
      return notFound();
    }
    const relativePath = c.req.param("path");
    if (!isSafeRelativePath(relativePath)) {
      return notFound();
    }
    let realPath: string;
    let realRoot: string;
    try {
      realPath = realpathSync(resolveInside(root, relativePath));
      realRoot = realpathSync(root);
    } catch {
      return notFound();
    }
    if (!realPath.startsWith(realRoot + sep) || !statSync(realPath).isFile()) {
      return notFound();
    }
    // シンボリックリンクの解決後に . で始まる場所(.auth/ など)を指していないか確かめる
    if (!isSafeRelativePath(realPath.slice(realRoot.length + 1).split(sep).join("/"))) {
      return notFound();
    }
    return c.body(readFileSync(realPath), 200, { "Content-Type": mimeType(realPath) });
  });

  app.get("/api/watch/:project", (c) => {
    const project = c.req.param("project");
    const root = resolveProject(project);
    if (!root) {
      return c.json({ error: "project not found" }, 404);
    }
    return createWatchHandler(project, root)(c);
  });

  return app;
}

export type AppType = ReturnType<typeof createApp>;
