import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { parseAnnotation, type AnnotationFile } from "./schema.js";
import { annotationFilePath } from "./safe-name.js";

let counter = 0;

/**
 * 同じフォルダの一時ファイルに書いてから rename で置き換える。
 * 書き込みの途中で失敗・中断しても、元のファイルが半端な内容にならない
 */
export function writeFileAtomic(path: string, data: string | Uint8Array): void {
  counter += 1;
  const temp = join(dirname(path), `.${basename(path)}.${process.pid}.${Date.now()}.${counter}.tmp`);
  try {
    writeFileSync(temp, data);
    renameSync(temp, path);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}

/**
 * 注釈JSONを検査してから annotations/<id>.json へアトミックに書き込む。
 * 出力形式は project.ts の writeAnnotationFile と同じ(2スペースインデント+末尾改行)
 */
export function writeAnnotationFileAtomic(
  projectRoot: string,
  id: string,
  annotation: AnnotationFile,
): AnnotationFile {
  const path = annotationFilePath(projectRoot, id);
  const parsed = parseAnnotation(annotation);
  mkdirSync(dirname(path), { recursive: true });
  writeFileAtomic(path, `${JSON.stringify(parsed, null, 2)}\n`);
  return parsed;
}
