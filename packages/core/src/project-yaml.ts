import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { YAMLMap, parseDocument } from "yaml";
import type { Document } from "yaml";

function projectYamlPath(projectRoot: string): string {
  return join(projectRoot, "project.yaml");
}

// project.yaml の読み込み→mutate→書き込みという定型処理をまとめる。
// 各 write* 関数はこのヘルパー経由でファイルを更新し、
// parseDocument/読み書きの重複コードを避ける
export function updateProjectYaml(projectRoot: string, mutate: (doc: Document) => void): void {
  const path = projectYamlPath(projectRoot);
  const doc = parseDocument(existsSync(path) ? readFileSync(path, "utf8") : "");
  mutate(doc);
  writeFileSync(path, doc.toString(), "utf8");
}

// key の値が YAMLMap でなければ空マップを作成する(setIn/deleteIn で安全にネストできるようにする)
export function ensureMap(doc: Document, key: string): void {
  if (!hasMap(doc, key)) {
    doc.set(key, doc.createNode({}));
  }
}

// key の値が YAMLMap かどうかを判定する。
// deleteIn は途中のキーが存在しないと例外を投げるため、呼び出し前のガードに使う
export function hasMap(doc: Document, key: string): boolean {
  return doc.get(key, true) instanceof YAMLMap;
}

// key の値が空の YAMLMap (または未設定) ならセクションごと削除する
export function pruneEmptyMap(doc: Document, key: string): void {
  const value = doc.get(key, true);
  if (value == null || (value instanceof YAMLMap && value.items.length === 0)) {
    doc.delete(key);
  }
}
