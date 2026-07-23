import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import {
  buildPreviewHtml,
  collectImageSources,
  getNaturalSizes,
  parseAnnotation,
  renderAnnotationPng,
  renderManualHtmlDownload,
  renderManualPdfDownload,
  renumberBadges,
} from "@mahomanual/core";
import {
  countAnnotationBadges,
  countUnicodeBadges,
  addPastedImageObject,
  createManualProject,
  listManuals,
  readAnnotationFile,
  readAnnotationDefaults,
  readManual,
  readProjectOutputFilenames,
  readProjectTheme,
  renameAnnotationId,
  renumberAllBadgesFiles,
  savePastedImage,
  writeAnnotationDefaults,
  writeAnnotationFile,
  writeProjectTheme,
  writeProjectOutputFilenames,
} from "@mahomanual/core/project";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { projectFileUrl, projectRoot, projectsDir } from "./paths.js";
import { parseUploadedImage } from "./parse-uploaded-image.js";
import { createWatchHandler } from "./watch.js";

import type { AnnotationFile } from "@mahomanual/core";

function isSafeName(name: string): boolean {
  return name.length > 0 && !name.includes("/") && !name.includes("\\") && !name.includes("..");
}

function resolveProject(name: string): string | null {
  if (!isSafeName(name)) {
    return null;
  }
  const root = projectRoot(name);
  if (!existsSync(join(root, "manual.md"))) {
    return null;
  }
  return root;
}

function outputFilenames(root: string, project: string) {
  return readProjectOutputFilenames(root, {
    html: `${project}.html`,
    pdf: `${project}.pdf`,
  });
}

function attachmentHeader(filename: string, fallback: string): string {
  if (/^[\x20-\x7e]+$/.test(filename)) {
    return `attachment; filename="${filename}"`;
  }
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

// ローカル専用ツール: ブラウザ上の別サイトからの書き込みを防ぐため
// localhost 系オリジンのみ許可する
const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function createApp() {
  const app = new Hono();

  app.use(
    "/api/*",
    cors({
      origin: (origin) => (LOCAL_ORIGIN_RE.test(origin) ? origin : null),
    }),
  );

  app.get("/api/projects", (c) => {
    return c.json(listManuals(projectsDir));
  });

  app.post("/api/projects", async (c) => {
    const body = await c.req.json<{ id?: string; title?: string }>();
    const id = body.id?.trim() ?? "";
    const title = body.title?.trim() || id;
    if (!isSafeName(id)) {
      return c.json({ error: "不正なプロジェクトIDです" }, 400);
    }
    try {
      createManualProject(projectsDir, id, title);
      return c.json({ id, title }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "project creation failed";
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
        "Content-Disposition": attachmentHeader(filename, `${project}.html`),
        "Cache-Control": "no-store",
      });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "HTML export failed" },
        500,
      );
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
        "Content-Disposition": attachmentHeader(filename, `${project}.pdf`),
        "Cache-Control": "no-store",
      });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "PDF export failed" },
        500,
      );
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
    const body = await c.req.json<{ html?: unknown; pdf?: unknown }>();
    if (typeof body.html !== "string" || typeof body.pdf !== "string") {
      return c.json({ error: "HTML/PDFファイル名を文字列で指定してください" }, 400);
    }
    try {
      return c.json(writeProjectOutputFilenames(root, { html: body.html, pdf: body.pdf }));
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "output update failed" }, 400);
    }
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
    const body = await c.req.json<{ body: string }>();
    if (typeof body.body !== "string") {
      return c.json({ error: "body is required" }, 400);
    }
    writeFileSync(join(root, "manual.md"), body.body, "utf8");
    return c.json({ ok: true });
  });

  app.get("/api/projects/:project/theme", (c) => {
    const root = resolveProject(c.req.param("project"));
    if (!root) {
      return c.json({ error: "project not found" }, 404);
    }
    return c.json({ theme: readProjectTheme(root), defaults: readAnnotationDefaults(root) });
  });

  // 注釈の既定テーマを更新する。キー省略(または null)は「既定値に戻す」
  app.put("/api/projects/:project/theme", async (c) => {
    const root = resolveProject(c.req.param("project"));
    if (!root) {
      return c.json({ error: "project not found" }, 404);
    }
    const body = await c.req.json<{
      color?: unknown;
      fontSize?: unknown;
      defaults?: unknown;
    }>();
    if (body.color != null && typeof body.color !== "string") {
      return c.json({ error: "colorは文字列で指定してください" }, 400);
    }
    if (body.fontSize != null && typeof body.fontSize !== "number") {
      return c.json({ error: "fontSizeは数値で指定してください" }, 400);
    }
    try {
      const theme = writeProjectTheme(root, {
        color: body.color ?? undefined,
        fontSize: body.fontSize ?? undefined,
      });
      if (body.defaults !== undefined) {
        writeAnnotationDefaults(root, (body.defaults ?? {}) as Record<string, unknown>);
      }
      return c.json({ theme, defaults: readAnnotationDefaults(root) });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "theme update failed" }, 400);
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
      const annotation = readAnnotationFile(root, id);
      const imageSources = collectImageSources(annotation);
      const naturalSizes = getNaturalSizes(root, imageSources);
      const theme = readProjectTheme(root);
      return c.json({
        annotation,
        naturalSizes,
        theme,
        defaults: readAnnotationDefaults(root),
      });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "not found" }, 404);
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
        "Content-Disposition": `attachment; filename="${id}.png"`,
        "Cache-Control": "no-store",
      });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "image export failed" },
        500,
      );
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
    const body = await c.req.json();
    try {
      const annotation = parseAnnotation(body);
      writeAnnotationFile(root, id, annotation);
      return c.json({ annotation });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "validation failed" }, 400);
    }
  });

  app.patch("/api/projects/:project/annotations/:id/id", async (c) => {
    const project = c.req.param("project");
    const currentId = c.req.param("id");
    const root = resolveProject(project);
    if (!root) {
      return c.json({ error: "project not found" }, 404);
    }
    const body = await c.req.json<{ id?: string }>();
    const nextId = body.id?.trim() ?? "";
    if (!isSafeName(currentId) || !isSafeName(nextId)) {
      return c.json({ error: "不正な画像IDです" }, 400);
    }
    if (existsSync(join(root, "annotations", `${nextId}.json`)) && nextId !== currentId) {
      return c.json({ error: `注釈IDが既に存在します: ${nextId}` }, 409);
    }
    try {
      const annotation = renameAnnotationId(root, currentId, nextId);
      return c.json({ id: nextId, annotation });
    } catch (error) {
      const message = error instanceof Error ? error.message : "rename failed";
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
      return c.json({ error: error instanceof Error ? error.message : "renumber failed" }, 400);
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
      return c.json({ error: error instanceof Error ? error.message : "renumber failed" }, 400);
    }
  });

  app.post("/api/projects/:project/images", async (c) => {
    const project = c.req.param("project");
    const root = resolveProject(project);
    if (!root) {
      return c.json({ error: "project not found" }, 404);
    }
    const body = await c.req.json<{ id: string; data: string; width?: number; height?: number }>();
    if (!body.id || !body.data) {
      return c.json({ error: "id and data are required" }, 400);
    }
    if (!isSafeName(body.id)) {
      return c.json({ error: "不正な画像IDです" }, 400);
    }
    // 既存の注釈を雛形で黙って上書きしない
    if (existsSync(join(root, "annotations", `${body.id}.json`))) {
      return c.json({ error: `注釈IDが既に存在します: ${body.id}` }, 409);
    }
    const parsed = parseUploadedImage(body.data, {
      width: body.width,
      height: body.height,
      fallback: { width: 1280, height: 960 },
    });
    if (!parsed.ok) {
      return c.json({ error: parsed.error }, 400);
    }
    try {
      const result = savePastedImage(root, body.id, parsed.buffer, {
        width: parsed.width,
        height: parsed.height,
      });
      return c.json({
        id: body.id,
        imagePath: result.imagePath,
        annotation: result.annotation,
      });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "save failed" }, 400);
    }
  });

  app.post("/api/projects/:project/annotations/:id/images", async (c) => {
    const project = c.req.param("project");
    const id = c.req.param("id");
    const root = resolveProject(project);
    if (!root) {
      return c.json({ error: "project not found" }, 404);
    }
    const body = await c.req.json<{
      objectId?: string;
      data?: string;
      width?: number;
      height?: number;
    }>();
    if (!body.objectId || !isSafeName(id) || !isSafeName(body.objectId)) {
      return c.json({ error: "不正なIDです" }, 400);
    }
    const parsed = parseUploadedImage(body.data, {
      width: body.width,
      height: body.height,
      strictMime: true,
    });
    if (!parsed.ok) {
      return c.json({ error: parsed.error }, 400);
    }
    try {
      const annotation = addPastedImageObject(root, id, body.objectId, parsed.buffer, {
        width: parsed.width,
        height: parsed.height,
      });
      return c.json({
        annotation,
        naturalSizes: getNaturalSizes(root, collectImageSources(annotation)),
        theme: readProjectTheme(root),
      }, 201);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "画像追加に失敗しました" }, 400);
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
    const body = await c.req.json<{ data?: string; width?: number; height?: number }>();
    const parsed = parseUploadedImage(body.data, {
      width: body.width,
      height: body.height,
      strictMime: true,
    });
    if (!parsed.ok) {
      return c.json({ error: parsed.error }, 400);
    }
    const { buffer, width, height } = parsed;

    try {
      const annotation = readAnnotationFile(root, id);
      const image = annotation.objects.find(
        (obj): obj is Extract<(typeof annotation.objects)[number], { type: "image" }> =>
          obj.id === objectId && obj.type === "image",
      );
      if (!image) {
        return c.json({ error: `imageオブジェクトが見つかりません: ${objectId}` }, 404);
      }

      const target = resolve(root, image.src);
      if (!target.startsWith(root + sep)) {
        return c.json({ error: "画像パスがプロジェクト外です" }, 400);
      }
      writeFileSync(target, buffer);

      const fullCanvas =
        image.rect.x === 0 &&
        image.rect.y === 0 &&
        image.rect.w === 100 &&
        image.rect.h === 100;
      const updated: AnnotationFile = {
        ...annotation,
        canvas: fullCanvas ? { width, height } : annotation.canvas,
        objects: annotation.objects.map((obj) =>
          obj.id === objectId && obj.type === "image"
            ? { ...obj, crop: { x: 0, y: 0, w: width, h: height } }
            : obj,
        ),
      };
      writeAnnotationFile(root, id, updated);
      return c.json({
        annotation: updated,
        naturalSizes: getNaturalSizes(root, collectImageSources(updated)),
      });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "replace failed" }, 400);
    }
  });

  app.post("/api/projects/:project/preview", async (c) => {
    const project = c.req.param("project");
    const root = resolveProject(project);
    if (!root) {
      return c.json({ error: "project not found" }, 404);
    }
    const body = await c.req.json<{ markdown: string }>();
    if (typeof body.markdown !== "string") {
      return c.json({ error: "markdown is required" }, 400);
    }
    try {
      const html = await buildPreviewHtml(root, body.markdown, {
        rewriteImageSrc: (src) => projectFileUrl(project, src),
      });
      return c.json({ html, theme: readProjectTheme(root) });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "preview failed" }, 400);
    }
  });

  app.get("/api/projects/:project/files/*", (c) => {
    const project = c.req.param("project");
    const root = resolveProject(project);
    if (!root) {
      return c.notFound();
    }
    const relativePath = c.req.path.replace(`/api/projects/${project}/files/`, "");
    const decoded = decodeURIComponent(relativePath);
    // resolve で .. を正規化し、区切り文字込みの前方一致で判定する
    // (単純な startsWith(root) では "projects/foo" が "projects/foobar" を許してしまう)
    const absolute = resolve(root, decoded);
    if (!absolute.startsWith(root + sep) || !existsSync(absolute)) {
      return c.notFound();
    }
    const file = readFileSync(absolute);
    const ext = decoded.split(".").pop()?.toLowerCase() ?? "";
    const mime =
      ext === "png"
        ? "image/png"
        : ext === "jpg" || ext === "jpeg"
          ? "image/jpeg"
          : ext === "gif"
            ? "image/gif"
            : ext === "webp"
              ? "image/webp"
              : "application/octet-stream";
    return c.body(file, 200, { "Content-Type": mime });
  });

  app.get("/api/watch/:project", (c) => createWatchHandler(c.req.param("project"))(c));

  return app;
}

export type AppType = ReturnType<typeof createApp>;
