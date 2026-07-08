import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import {
  buildPreviewHtml,
  getNaturalSizes,
  parseAnnotation,
  renumberBadges,
} from "@mahomanual/core";
import {
  countAnnotationBadges,
  countUnicodeBadges,
  listManuals,
  readAnnotationFile,
  readManual,
  renumberAllBadgesFiles,
  savePastedImage,
  writeAnnotationFile,
} from "@mahomanual/core/project";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { imageSize } from "image-size";
import { projectFileUrl, projectRoot, projectsDir } from "./paths.js";
import { createWatchHandler } from "./watch.js";

import type { AnnotationFile } from "@mahomanual/core";

function collectImageSources(annotation: AnnotationFile): string[] {
  return annotation.objects
    .filter((obj): obj is Extract<(typeof annotation.objects)[number], { type: "image" }> => obj.type === "image")
    .map((obj) => obj.src);
}

// プロジェクト名・注釈ID・画像ID はファイル名の1セグメントに限定する
// (パス区切りや .. によるプロジェクト外への読み書きを防ぐ)
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
      return c.json({ annotation, naturalSizes });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "not found" }, 404);
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
    const base64 = body.data.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64, "base64");
    let width = body.width;
    let height = body.height;
    if (!width || !height) {
      const size = imageSize(buffer);
      width = size.width ?? 1280;
      height = size.height ?? 960;
    }
    try {
      const result = savePastedImage(root, body.id, buffer, { width, height });
      return c.json({
        id: body.id,
        imagePath: result.imagePath,
        annotation: result.annotation,
      });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "save failed" }, 400);
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
      return c.json({ html });
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
