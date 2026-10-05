#!/usr/bin/env node
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { createManualProject as createCoreManualProject } from "@mahomanual/core/project";
import { isSafeName } from "@mahomanual/core/safe-name";

// core / playwright は import 連鎖が重いため、top-level では読み込まず
// 各コマンドの実行時に動的 import する(`manual new` 等の起動を軽く保つ)

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

// プロジェクト名を置くフォルダ。既定はリポジトリの projects/。
// 環境変数 MAHOMANUAL_PROJECTS_DIR で変更できる(テストや別の場所での運用向け)
export function getProjectsDir(): string {
  const fromEnv = process.env.MAHOMANUAL_PROJECTS_DIR;
  return fromEnv ? resolve(fromEnv) : join(repoRoot, "projects");
}

// <project> は実行時のフォルダからのパス、または projects/ 配下のプロジェクト名。
// CLI は利用者が手元で実行するためパス指定を受け付ける。名前として探すのは安全な名前(SPEC §3.1)の場合だけ
export function resolveProjectPath(input: string): string {
  const direct = resolve(input);
  if (existsSync(join(direct, "manual.md"))) {
    return direct;
  }
  if (isSafeName(input)) {
    const underProjects = join(getProjectsDir(), input);
    if (existsSync(join(underProjects, "manual.md"))) {
      return underProjects;
    }
  }
  throw new Error(`プロジェクトが見つかりません: ${input}`);
}

export function createManualProject(name: string): string {
  return createCoreManualProject(getProjectsDir(), name, name);
}

async function runBuild(projectInput: string, options: { output?: string; singleFile?: boolean }) {
  const { buildProject } = await import("@mahomanual/core/build");
  const projectRoot = resolveProjectPath(projectInput);
  const outputDir = options.output ? resolve(options.output) : join(projectRoot, "dist");
  await buildProject(projectRoot, { outputDir, singleFile: options.singleFile });
  console.log(`HTML: ${join(outputDir, "manual.html")}`);
}

async function runPdf(projectInput: string, options: { output?: string }) {
  const { exportManualPdf } = await import("@mahomanual/core/project");
  const projectRoot = resolveProjectPath(projectInput);
  // -o 指定時も HTML はプロジェクトの dist/ に生成し、PDF だけを指定先に書き出す
  // (指定先のフォルダにある manual.html や img/ を上書き・削除しない)
  const outputPath = options.output ? resolve(options.output) : undefined;
  if (outputPath) {
    mkdirSync(dirname(outputPath), { recursive: true });
  }
  const pdfPath = await exportManualPdf(projectRoot, outputPath);
  console.log(`PDF: ${pdfPath}`);
}

async function runRenumber(projectInput: string, annotationId: string) {
  const { renumberBadgesFile } = await import("@mahomanual/core/project");
  const projectRoot = resolveProjectPath(projectInput);
  const result = renumberBadgesFile(projectRoot, annotationId);
  const badges = result.objects.filter((obj) => obj.type === "badge").length;
  console.log(`Renumbered: ${annotationId} (badge ${badges} 個)`);
}

async function runCaptureCommand(
  projectInput: string,
  recipeId: string | undefined,
  options: { all?: boolean },
) {
  if (options.all && recipeId) {
    throw new Error("recipeId と --all は同時に指定できません。どちらか一方を指定してください");
  }
  const { runProjectCapture } = await import("@mahomanual/core/project");
  const projectRoot = resolveProjectPath(projectInput);
  if (options.all) {
    const results = await runProjectCapture(projectRoot);
    for (const item of results) {
      console.log(`Captured: ${item.output} (${item.recipeId})`);
    }
    return;
  }
  if (!recipeId) {
    throw new Error("recipeId を指定するか --all を使ってください");
  }
  const results = await runProjectCapture(projectRoot, recipeId);
  console.log(`Captured: ${results[0]?.output ?? recipeId}`);
}

async function runLogin(projectInput: string, url: string) {
  const { chromium } = await import("playwright");
  const { waitForLoginAndSaveState } = await import("./login.js");
  const projectRoot = resolveProjectPath(projectInput);
  const statePath = join(projectRoot, ".auth", "state.json");

  console.log("ブラウザが開きます。ログイン完了後、ブラウザを閉じると storageState が保存されます。");
  const browser = await chromium.launch({ headless: false });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const waiting = waitForLoginAndSaveState(context, statePath);
    try {
      await page.goto(url);
    } catch (error) {
      // 読み込み中に利用者がページを閉じた場合はそのまま終了を待つ
      if (!page.isClosed()) {
        throw error;
      }
    }
    const saved = await waiting;
    if (!saved) {
      throw new Error(`storageState を保存できませんでした: ${statePath}`);
    }
    console.log(`Saved: ${statePath}`);
  } finally {
    await browser.close().catch(() => undefined);
  }
}

export function createProgram(): Command {
  const program = new Command();

  program.name("manual").description("MahoManual CLI");

  program
    .command("new")
    .argument("<name>", "project name")
    .action((name: string) => {
      const projectRoot = createManualProject(name);
      console.log(`Created: ${projectRoot}`);
    });

  program
    .command("build")
    .argument("<project>", "project path or name")
    .option("-o, --output <dir>", "output directory")
    .option("--single-file", "inline images as base64")
    .action(async (project: string, options: { output?: string; singleFile?: boolean }) => {
      await runBuild(project, options);
    });

  program
    .command("pdf")
    .argument("<project>", "project path or name")
    .option("-o, --output <file>", "output pdf path")
    .action(async (project: string, options: { output?: string }) => {
      await runPdf(project, options);
    });

  program
    .command("renumber")
    .argument("<project>", "project path or name")
    .argument("<annotationId>", "annotation id")
    .action(async (project: string, annotationId: string) => {
      await runRenumber(project, annotationId);
    });

  program
    .command("login")
    .argument("<project>", "project path or name")
    .requiredOption("--url <url>", "login page URL")
    .description(
      "headed ブラウザを開き、人間がログイン後ブラウザを閉じると .auth/state.json に storageState を保存します",
    )
    .action(async (project: string, options: { url: string }) => {
      await runLogin(project, options.url);
    });

  program
    .command("capture")
    .argument("<project>", "project path or name")
    .argument("[recipeId]", "capture recipe id")
    .option("--all", "run all capture recipes")
    .action(async (project: string, recipeId: string | undefined, options: { all?: boolean }) => {
      await runCaptureCommand(project, recipeId, options);
    });

  return program;
}

async function main() {
  const program = createProgram();
  await program.parseAsync(process.argv);
}

const entryPath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === entryPath) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
}
