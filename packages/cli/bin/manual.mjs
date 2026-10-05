#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const entry = join(packageRoot, "src/index.ts");
// tsx はこのパッケージの依存から絶対URLで読み込む。
// 実行時のフォルダ(cwd)は呼び出し元のまま引き継ぎ、相対パスをそこから解決させる。
// `pnpm manual`(このパッケージの manual スクリプト)経由では pnpm が cwd をこのパッケージに
// 移すため、pnpm を実行したフォルダ(INIT_CWD)に戻す
const viaPnpmScript =
  process.env.npm_lifecycle_event === "manual" &&
  process.env.npm_package_name === "@mahomanual/cli" &&
  process.env.INIT_CWD;
const cwd = viaPnpmScript ? process.env.INIT_CWD : process.cwd();
const tsxLoader = import.meta.resolve("tsx");
const result = spawnSync(
  process.execPath,
  ["--import", tsxLoader, entry, ...process.argv.slice(2)],
  { stdio: "inherit", cwd },
);

process.exit(result.status ?? 1);
