// プロジェクトID・注釈ID・オブジェクトID・レシピIDに使える文字(SPEC §3.1)。
// 文字(日本語を含む)・結合文字・数字・ハイフン・アンダースコアのみ。
// `.` `/` `\` 引用符・山括弧・空白などはファイルパスやHTML属性を壊すため許可しない
const SAFE_NAME_RE = /^[\p{L}\p{M}\p{N}_-]+$/u;

export function isSafeName(name: unknown): name is string {
  return typeof name === "string" && SAFE_NAME_RE.test(name);
}

export function assertSafeName(name: unknown, label: string): string {
  if (!isSafeName(name)) {
    throw new Error(
      `不正な${label}です(文字・数字・-・_ のみ使用できます): ${JSON.stringify(name)}`,
    );
  }
  return name;
}

// プロジェクトルートからの相対パスとして安全か。
// 絶対パス・ドライブ指定・`\`・空のセグメント・`.` で始まるセグメント(`..` や隠しファイル)を拒否する
export function isSafeRelativePath(path: unknown): path is string {
  if (typeof path !== "string" || path.length === 0) {
    return false;
  }
  if (path.includes("\\") || /[\u0000-\u001f\u007f]/.test(path)) {
    return false;
  }
  if (path.startsWith("/") || /^[A-Za-z]:/.test(path)) {
    return false;
  }
  return path.split("/").every((segment) => segment.length > 0 && !segment.startsWith("."));
}

// 以下はブラウザ(GUI)からも読み込まれる schema.ts が依存するため node:path を使わずに書く。
// 区切り文字は "/"(Node の fs は Windows でも "/" を受け付ける)

function joinPath(baseDir: string, ...segments: string[]): string {
  const base = baseDir.length > 1 ? baseDir.replace(/\/+$/, "") : baseDir;
  if (base.length === 0) {
    return segments.join("/");
  }
  return base.endsWith("/") ? `${base}${segments.join("/")}` : `${base}/${segments.join("/")}`;
}

// baseDir からの相対パスを解決し、baseDir の外を指す場合はエラーにする。
// `..` で baseDir より上に出るパス・絶対パス・\ を含むパス・空のパスを拒否する
export function resolveInside(baseDir: string, relativePath: string): string {
  const fail = () => new Error(`フォルダの外を指すパスは使用できません: ${relativePath}`);
  if (
    relativePath.length === 0 ||
    relativePath.includes("\\") ||
    relativePath.includes("\u0000") ||
    relativePath.startsWith("/") ||
    /^[A-Za-z]:/.test(relativePath)
  ) {
    throw fail();
  }
  const segments: string[] = [];
  for (const segment of relativePath.split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      if (segments.length === 0) {
        throw fail();
      }
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  if (segments.length === 0) {
    throw fail();
  }
  return joinPath(baseDir, ...segments);
}

export function resolveProjectRoot(projectsDir: string, name: string): string {
  return joinPath(projectsDir, assertSafeName(name, "プロジェクトID"));
}

export function annotationFilePath(projectRoot: string, id: string): string {
  return joinPath(projectRoot, "annotations", `${assertSafeName(id, "注釈ID")}.json`);
}
