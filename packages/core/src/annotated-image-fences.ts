import type { Code, Root } from "mdast";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { isScalar, parse as parseYaml, parseDocument, Scalar } from "yaml";

// YAML でそのまま書くと文字列として読めるか(例: "123" は数値になるため引用符が要る)
function yamlScalarText(value: string, quote: Scalar["type"]): string {
  if (quote === Scalar.QUOTE_DOUBLE) {
    return JSON.stringify(value);
  }
  if (quote === Scalar.QUOTE_SINGLE) {
    return `'${value.replace(/'/g, "''")}'`;
  }
  const plainValue = (() => {
    try {
      return (parseYaml(`v: ${value}`) as { v?: unknown } | null)?.v;
    } catch {
      return undefined;
    }
  })();
  return plainValue === value ? value : JSON.stringify(value);
}

interface Replacement {
  start: number;
  end: number;
  text: string;
}

/**
 * manual.md の annotated-image フェンスのうち `src` が currentId のものを nextId に書き換える。
 * フェンスの検出は build と同じ Markdown 解析で行い、YAML の src の値の部分だけを置き換える
 * (行末コメント・引用符・リスト内の字下げ・他のキーはそのまま残す)
 */
export function renameAnnotatedImageSrc(markdown: string, currentId: string, nextId: string): string {
  const tree = unified().use(remarkParse).parse(markdown) as Root;
  const lineStarts = [0];
  for (let i = 0; i < markdown.length; i += 1) {
    if (markdown[i] === "\n") {
      lineStarts.push(i + 1);
    }
  }
  const sourceLine = (line: number): { start: number; text: string } => {
    const start = lineStarts[line - 1] ?? markdown.length;
    const next = lineStarts[line] ?? markdown.length + 1;
    return { start, text: markdown.slice(start, next - 1).replace(/\r$/, "") };
  };

  const replacements: Replacement[] = [];
  visit(tree, "code", (node: Code) => {
    if (node.lang !== "annotated-image" || !node.position) {
      return;
    }
    const doc = parseDocument(node.value);
    if (doc.errors.length > 0) {
      return;
    }
    const scalar = doc.get("src", true);
    if (!isScalar(scalar) || scalar.value !== currentId || !scalar.range) {
      return;
    }
    const [valueStart, valueEnd] = scalar.range;
    const before = node.value.slice(0, valueStart);
    const lineIndex = before.split("\n").length - 1;
    const column = valueStart - (before.lastIndexOf("\n") + 1);
    const valueLines = node.value.split("\n");
    const valueLine = (valueLines[lineIndex] ?? "").replace(/\r$/, "");
    // 本文の1行目はフェンス開始行の次の行。字下げ・引用記号は行頭だけが取り除かれている
    const line = sourceLine(node.position.start.line + 1 + lineIndex);
    const prefixLength = line.text.length - valueLine.length;
    const original = node.value.slice(valueStart, valueEnd);
    const start = line.start + prefixLength + column;
    if (prefixLength < 0 || markdown.slice(start, start + original.length) !== original) {
      return;
    }
    replacements.push({
      start,
      end: start + original.length,
      text: yamlScalarText(nextId, scalar.type),
    });
  });

  let result = markdown;
  for (const { start, end, text } of replacements.sort((a, b) => b.start - a.start)) {
    result = `${result.slice(0, start)}${text}${result.slice(end)}`;
  }
  return result;
}
