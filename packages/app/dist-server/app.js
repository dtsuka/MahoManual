import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildPreviewHtml, getNaturalSizes, parseAnnotation, renumberBadges, } from "@mahomanual/core";
import { countAnnotationBadges, countUnicodeBadges, listManuals, readAnnotationFile, readManual, savePastedImage, writeAnnotationFile, } from "@mahomanual/core/project";
import { Hono } from "hono";
import { cors } from "hono/cors";
import imageSize from "image-size";
import { projectFileUrl, projectRoot, projectsDir } from "./paths.js";
import { createWatchHandler } from "./watch.js";
function collectImageSources(annotation) {
    return annotation.objects
        .filter((obj) => obj.type === "image")
        .map((obj) => obj.src);
}
function resolveProject(name) {
    const root = projectRoot(name);
    if (!existsSync(join(root, "manual.md"))) {
        return null;
    }
    return root;
}
export function createApp() {
    const app = new Hono();
    app.use("/api/*", cors());
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
        const body = await c.req.json();
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
        try {
            const annotation = readAnnotationFile(root, id);
            const imageSources = collectImageSources(annotation);
            const naturalSizes = getNaturalSizes(root, imageSources);
            return c.json({ annotation, naturalSizes });
        }
        catch (error) {
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
        const body = await c.req.json();
        try {
            const annotation = parseAnnotation(body);
            writeAnnotationFile(root, id, annotation);
            return c.json({ annotation });
        }
        catch (error) {
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
        try {
            const annotation = readAnnotationFile(root, id);
            const renumbered = renumberBadges(annotation);
            writeAnnotationFile(root, id, renumbered);
            const manualBody = readFileSync(join(root, "manual.md"), "utf8");
            const unicodeCount = countUnicodeBadges(manualBody);
            const badgeCount = countAnnotationBadges(renumbered);
            const warning = unicodeCount !== badgeCount
                ? `Unicode丸数字(${unicodeCount}個)とbadge(${badgeCount}個)の数が一致しません`
                : null;
            return c.json({ annotation: renumbered, warning });
        }
        catch (error) {
            return c.json({ error: error instanceof Error ? error.message : "renumber failed" }, 400);
        }
    });
    app.post("/api/projects/:project/images", async (c) => {
        const project = c.req.param("project");
        const root = resolveProject(project);
        if (!root) {
            return c.json({ error: "project not found" }, 404);
        }
        const body = await c.req.json();
        if (!body.id || !body.data) {
            return c.json({ error: "id and data are required" }, 400);
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
        }
        catch (error) {
            return c.json({ error: error instanceof Error ? error.message : "save failed" }, 400);
        }
    });
    app.post("/api/projects/:project/preview", async (c) => {
        const project = c.req.param("project");
        const root = resolveProject(project);
        if (!root) {
            return c.json({ error: "project not found" }, 404);
        }
        const body = await c.req.json();
        if (typeof body.markdown !== "string") {
            return c.json({ error: "markdown is required" }, 400);
        }
        try {
            const html = await buildPreviewHtml(root, body.markdown, {
                rewriteImageSrc: (src) => projectFileUrl(project, src),
            });
            return c.json({ html });
        }
        catch (error) {
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
        const absolute = join(root, decoded);
        if (!absolute.startsWith(root) || !existsSync(absolute)) {
            return c.notFound();
        }
        const file = readFileSync(absolute);
        const ext = decoded.split(".").pop()?.toLowerCase() ?? "";
        const mime = ext === "png"
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
