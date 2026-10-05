import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { YAMLMap, isCollection, isMap, isScalar, parseDocument } from "yaml";
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
  // 中身が `null` だけの文書は、キーを追加できるよう中身の無い文書として扱う
  let contentComment: string | null | undefined;
  if (isScalar(doc.contents) && doc.contents.value === null) {
    contentComment = doc.contents.commentBefore;
    doc.contents = null;
  }
  mutate(doc);
  // 書くキーが無いときに yaml は "null" や "{}" を出力するため、コメントだけを書く
  if (!isCollection(doc.contents) || (isMap(doc.contents) && doc.contents.items.length === 0)) {
    const text = [doc.commentBefore, contentComment, doc.comment]
      .filter((comment): comment is string => typeof comment === "string" && comment.length > 0)
      .map((comment) => `${comment.split("\n").map((line) => `#${line}`).join("\n")}\n`)
      .join("");
    if (text.length > 0 || existsSync(path)) {
      writeFileSync(path, text, "utf8");
    }
    return;
  }
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
  // project.yaml が無い・空・コメントだけの場合は文書の中身がマップでなく、消すキーも無い
  // (この状態で delete を呼ぶと yaml が "Expected a YAML collection" を投げる)
  if (!isMap(doc.contents)) {
    return;
  }
  const value = doc.get(key, true);
  if (value == null || (value instanceof YAMLMap && value.items.length === 0)) {
    doc.delete(key);
  }
}
