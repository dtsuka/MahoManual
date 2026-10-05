import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isMap, parseDocument } from "yaml";
import { validateAnnotationDefaults, type AnnotationDefaults } from "./annotation-defaults.js";
import {
  readAnnotationDefaults,
  readProjectTheme,
  writeAnnotationDefaults,
  writeProjectTheme,
} from "./project.js";
import type { AnnotationTheme } from "./theme.js";

const COLOR_RE = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

export interface ProjectThemeUpdate {
  /** 省略(undefined)で既定色に戻す */
  color?: string;
  /** 省略(undefined)で既定のフォントサイズに戻す */
  fontSize?: number;
  /** undefined は変更しない。null または {} は種類別の既定値をすべて消す */
  defaults?: unknown;
}

// project.yaml が無い、または中身がマッピングでない(空・コメントのみ)とき false
function hasYamlMapping(projectRoot: string): boolean {
  const path = join(projectRoot, "project.yaml");
  if (!existsSync(path)) {
    return false;
  }
  return isMap(parseDocument(readFileSync(path, "utf8")).contents);
}

/**
 * project.yaml の注釈テーマ(color / fontSize)と種類別の既定値(defaults)をまとめて更新する。
 * すべての値を先に検査し、不正な値があれば何も書かない
 */
export function updateProjectTheme(
  projectRoot: string,
  update: ProjectThemeUpdate,
): { theme: AnnotationTheme; defaults: AnnotationDefaults } {
  const { color, fontSize } = update;
  if (color !== undefined && !(typeof color === "string" && COLOR_RE.test(color))) {
    throw new Error(`不正なカラーコードです: ${String(color)}`);
  }
  if (fontSize !== undefined && !(typeof fontSize === "number" && Number.isFinite(fontSize) && fontSize > 0)) {
    throw new Error(`不正なフォントサイズです: ${String(fontSize)}`);
  }
  const defaults =
    update.defaults === undefined ? undefined : validateAnnotationDefaults(update.defaults ?? {});

  // 書き込む値も消す値も無いときは project.yaml に触れない
  // (中身がマッピングでない project.yaml からキーを消すと yaml ライブラリがエラーを投げる)
  const hasMapping = hasYamlMapping(projectRoot);
  if (color !== undefined || fontSize !== undefined || hasMapping) {
    writeProjectTheme(projectRoot, { color, fontSize });
  }
  if (defaults !== undefined && (Object.keys(defaults).length > 0 || hasYamlMapping(projectRoot))) {
    writeAnnotationDefaults(projectRoot, defaults);
  }
  return { theme: readProjectTheme(projectRoot), defaults: readAnnotationDefaults(projectRoot) };
}
