#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";

// core / playwright は import 連鎖が重いため、top-level では読み込まず
// 各コマンドの実行時に動的 import する(`manual new` 等の起動を軽く保つ)

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export function resolveProjectPath(input: string): string {
  const direct = resolve(input);
  if (existsSync(join(direct, "manual.md"))) {
    return direct;
  }
  const underProjects = join(repoRoot, "projects", input);
  if (existsSync(join(underProjects, "manual.md"))) {
    return underProjects;
  }
  throw new Error(`プロジェクトが見つかりません: ${input}`);
}

export function createManualProject(name: string): string {
  const projectRoot = join(repoRoot, "projects", name);
  if (existsSync(projectRoot)) {
    throw new Error(`プロジェクトは既に存在します: ${name}`);
  }

  mkdirSync(join(projectRoot, "annotations"), { recursive: true });
  mkdirSync(join(projectRoot, "img", "raw"), { recursive: true });
  mkdirSync(join(projectRoot, "captures"), { recursive: true });

  writeFileSync(
    join(projectRoot, "project.yaml"),
    `title: ${name}\n`,
    "utf8",
  );
  writeFileSync(
    join(projectRoot, "manual.md"),
    `# ${name}\n\n## 1 はじめに\n\n本文をここに書きます。\n`,
    "utf8",
  );

  return projectRoot;
}

async function runBuild(projectInput: string, options: { output?: string; singleFile?: boolean }) {
  const { buildProject } = await import("@mahomanual/core/build");
  const projectRoot = resolveProjectPath(projectInput);
  const outputDir = options.output ? resolve(options.output) : join(projectRoot, "dist");
  await buildProject(projectRoot, { outputDir, singleFile: options.singleFile });
  console.log(`HTML: ${join(outputDir, "manual.html")}`);
}

async function runPdf(projectInput: string, options: { output?: string }) {
  const { buildProject } = await import("@mahomanual/core/build");
  const { exportPdf } = await import("@mahomanual/core/pdf");
  const projectRoot = resolveProjectPath(projectInput);
  const outputPath = options.output ? resolve(options.output) : join(projectRoot, "dist", "manual.pdf");
  const distDir = dirname(outputPath);
  mkdirSync(distDir, { recursive: true });
  await buildProject(projectRoot, { outputDir: distDir });
  await exportPdf(distDir, { outputPath });
  console.log(`PDF: ${outputPath}`);
}

async function runRenumber(projectInput: string, annotationId: string) {
  const { parseAnnotation } = await import("@mahomanual/core/schema");
  const { renumberBadges } = await import("@mahomanual/core/project");
  const projectRoot = resolveProjectPath(projectInput);
  const annotationPath = join(projectRoot, "annotations", `${annotationId}.json`);
  if (!existsSync(annotationPath)) {
    throw new Error(`注釈ファイルが見つかりません: ${annotationId}`);
  }
  const annotation = parseAnnotation(JSON.parse(readFileSync(annotationPath, "utf8")));
  const renumbered = renumberBadges(annotation);
  writeFileSync(annotationPath, `${JSON.stringify(renumbered, null, 2)}\n`, "utf8");
}

async function runCaptureCommand(
  projectInput: string,
  recipeId: string | undefined,
  options: { all?: boolean },
) {
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
  const projectRoot = resolveProjectPath(projectInput);
  const authDir = join(projectRoot, ".auth");
  mkdirSync(authDir, { recursive: true });
  const statePath = join(authDir, "state.json");

  console.log("ブラウザが開きます。ログイン完了後、ブラウザを閉じると storageState が保存されます。");
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(url);
  await page.waitForEvent("close", { timeout: 0 }).catch(() => undefined);
  await context.storageState({ path: statePath });
  await browser.close();
  console.log(`Saved: ${statePath}`);
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
