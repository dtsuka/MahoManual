import {
  addAnnotationObject,
  buildManualHtml,
  expandCanvasFile,
  exportManualPdf,
  listManuals,
  readAnnotationFile,
  readManual,
  removeAnnotationObject,
  renumberBadgesFile,
  runProjectCapture,
  setCrop,
  updateAnnotationObject,
} from "@mahomanual/core/project";
import type { AnnotationObject } from "@mahomanual/core/schema";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runTool } from "./errors.js";
import { defaultRepoRoot, getProjectsDir, resolveProjectPath } from "./paths.js";

export interface MahoManualServerOptions {
  repoRoot?: string;
  // プロジェクトを置くフォルダ。省略時は <repoRoot>/projects
  projectsDir?: string;
}

export function createMahoManualServer(options: MahoManualServerOptions = {}): McpServer {
  const repoRoot = options.repoRoot ?? defaultRepoRoot;
  const projectsDir = options.projectsDir ?? getProjectsDir(repoRoot);

  const server = new McpServer({
    name: "MahoManual",
    version: "0.0.0",
  });

  server.registerTool(
    "list_manuals",
    {
      description: "projects/ 配下のマニュアル一覧を返します",
      inputSchema: {},
    },
    async () =>
      runTool(() => listManuals(projectsDir)),
  );

  server.registerTool(
    "read_manual",
    {
      description: "manual.md 本文と annotations / captures の一覧を返します",
      inputSchema: {
        project: z.string().describe("projects/ 配下のプロジェクト名"),
      },
    },
    async ({ project }) =>
      runTool(() => {
        const projectRoot = resolveProjectPath(projectsDir, project);
        return readManual(projectRoot);
      }),
  );

  server.registerTool(
    "read_annotation",
    {
      description: "注釈 JSON を取得します",
      inputSchema: {
        project: z.string().describe("projects/ 配下のプロジェクト名"),
        id: z.string().describe("注釈 ID"),
      },
    },
    async ({ project, id }) =>
      runTool(() => {
        const projectRoot = resolveProjectPath(projectsDir, project);
        return readAnnotationFile(projectRoot, id);
      }),
  );

  server.registerTool(
    "add_annotation",
    {
      description: "注釈オブジェクトを追加します（スキーマ検証あり）",
      inputSchema: {
        project: z.string().describe("projects/ 配下のプロジェクト名"),
        id: z.string().describe("注釈 ID"),
        object: z.record(z.unknown()).describe("追加する注釈オブジェクト"),
      },
    },
    async ({ project, id, object }) =>
      runTool(() => {
        const projectRoot = resolveProjectPath(projectsDir, project);
        return addAnnotationObject(projectRoot, id, object as AnnotationObject);
      }),
  );

  server.registerTool(
    "update_annotation",
    {
      description:
        "注釈オブジェクトを部分更新します。patch で id と type は変更できません(種類を変えるときは削除して追加し直します)",
      inputSchema: {
        project: z.string().describe("projects/ 配下のプロジェクト名"),
        id: z.string().describe("注釈 ID"),
        objectId: z.string().describe("オブジェクト ID"),
        patch: z.record(z.unknown()).describe("更新するフィールド"),
      },
    },
    async ({ project, id, objectId, patch }) =>
      runTool(() => {
        const locked = ["id", "type"].filter((key) => Object.hasOwn(patch, key));
        if (locked.length > 0) {
          throw new Error(
            `patch で ${locked.join(" / ")} は変更できません。id・type を変えるときは remove_annotation で削除し、add_annotation で追加し直してください`,
          );
        }
        const projectRoot = resolveProjectPath(projectsDir, project);
        return updateAnnotationObject(projectRoot, id, objectId, patch as Partial<AnnotationObject>);
      }),
  );

  server.registerTool(
    "remove_annotation",
    {
      description: "注釈オブジェクトを削除します",
      inputSchema: {
        project: z.string().describe("projects/ 配下のプロジェクト名"),
        id: z.string().describe("注釈 ID"),
        objectId: z.string().describe("オブジェクト ID"),
      },
    },
    async ({ project, id, objectId }) =>
      runTool(() => {
        const projectRoot = resolveProjectPath(projectsDir, project);
        return removeAnnotationObject(projectRoot, id, objectId);
      }),
  );

  server.registerTool(
    "set_crop",
    {
      description: "image オブジェクトの crop を変更します",
      inputSchema: {
        project: z.string().describe("projects/ 配下のプロジェクト名"),
        id: z.string().describe("注釈 ID"),
        objectId: z.string().describe("image オブジェクト ID"),
        crop: z
          .object({
            x: z.number(),
            y: z.number(),
            w: z.number(),
            h: z.number(),
          })
          .describe("クロップ矩形（画像ファイルの実ピクセル）"),
      },
    },
    async ({ project, id, objectId, crop }) =>
      runTool(() => {
        const projectRoot = resolveProjectPath(projectsDir, project);
        return setCrop(projectRoot, id, objectId, crop);
      }),
  );

  server.registerTool(
    "expand_canvas",
    {
      description:
        "キャンバス余白を追加/削除します(SPEC §4.5)。canvasを拡張し全オブジェクトの%座標を再計算して見た目位置を維持します。画像の端の外側に注釈を置きたいときに使います",
      inputSchema: {
        project: z.string().describe("projects/ 配下のプロジェクト名"),
        id: z.string().describe("注釈 ID"),
        margin: z
          .object({
            top: z.number().optional(),
            right: z.number().optional(),
            bottom: z.number().optional(),
            left: z.number().optional(),
          })
          .describe("上下左右の余白CSS px(負値で削除。結果のcanvas寸法は正であること)"),
      },
    },
    async ({ project, id, margin }) =>
      runTool(() => {
        const projectRoot = resolveProjectPath(projectsDir, project);
        return expandCanvasFile(projectRoot, id, margin);
      }),
  );

  server.registerTool(
    "renumber_badges",
    {
      description: "badge の採番を配列順に振り直します",
      inputSchema: {
        project: z.string().describe("projects/ 配下のプロジェクト名"),
        id: z.string().describe("注釈 ID"),
      },
    },
    async ({ project, id }) =>
      runTool(() => {
        const projectRoot = resolveProjectPath(projectsDir, project);
        return renumberBadgesFile(projectRoot, id);
      }),
  );

  server.registerTool(
    "build_html",
    {
      description: "納品 HTML を生成し、出力パスを返します",
      inputSchema: {
        project: z.string().describe("projects/ 配下のプロジェクト名"),
        singleFile: z.boolean().optional().describe("画像を base64 インライン化する"),
      },
    },
    async ({ project, singleFile }) =>
      runTool(async () => {
        const projectRoot = resolveProjectPath(projectsDir, project);
        const htmlPath = await buildManualHtml(projectRoot, { singleFile });
        return { htmlPath };
      }),
  );

  server.registerTool(
    "export_pdf",
    {
      description: "PDF を生成し、出力パスを返します",
      inputSchema: {
        project: z.string().describe("projects/ 配下のプロジェクト名"),
      },
    },
    async ({ project }) =>
      runTool(async () => {
        const projectRoot = resolveProjectPath(projectsDir, project);
        const pdfPath = await exportManualPdf(projectRoot);
        return { pdfPath };
      }),
  );

  server.registerTool(
    "run_capture",
    {
      description: "撮影レシピを実行します（recipeId 省略時は全件）",
      inputSchema: {
        project: z.string().describe("projects/ 配下のプロジェクト名"),
        recipeId: z.string().optional().describe("レシピ ID"),
      },
    },
    async ({ project, recipeId }) =>
      runTool(async () => {
        const projectRoot = resolveProjectPath(projectsDir, project);
        const results = await runProjectCapture(projectRoot, recipeId);
        return { results };
      }),
  );

  return server;
}
