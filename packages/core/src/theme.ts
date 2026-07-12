// 納品 HTML へ埋め込むテーマ CSS。
// ページ全体のスタイル(body / hr / 印刷)と figure(.mm 系)を分離し、
// GUI エディタは THEME_FIGURE_CSS のみを再利用する(手書き複製を禁止)
//
// 注釈の既定色・フォントサイズは CSS カスタムプロパティで定義し、
// project.yaml の annotation 設定(annotationThemeCss)で上書きできる。
// オブジェクト個別の指定はレンダラーが inline style で出力し、これらに勝つ

export const DEFAULT_ANNOTATION_COLOR = "#E91E8C";
export const DEFAULT_ANNOTATION_FONT_SIZE = 14;
export const DEFAULT_CURSOR_COLOR = "#000000";

/** 納品 HTML・注釈・アプリ UI で共通利用するフォントファミリー */
export const THEME_FONT_FAMILY = '"Noto Sans JP", sans-serif';

/** 納品 HTML / PNG 書き出し用の Google Fonts 読み込み(<head> に挿入) */
export const THEME_FONT_LINKS_HTML = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">`;

// 本文タイポグラフィ。納品 HTML と GUI プレビューで共有する。
// UA 既定に近い余白を明示し、Tailwind Preflight 等で margin が消えても見た目を揃える。
export const THEME_TYPOGRAPHY_CSS = `h1 { font-size: 2em; font-weight: bold; margin: 0.67em 0; }
h2 { font-size: 1.5em; font-weight: bold; margin: 0.83em 0; }
h3 { font-size: 1.17em; font-weight: bold; margin: 1em 0; }
h4 { font-size: 1em; font-weight: bold; margin: 1.33em 0; }
h5 { font-size: 0.83em; font-weight: bold; margin: 1.67em 0; }
h6 { font-size: 0.67em; font-weight: bold; margin: 2.33em 0; }
p, ul, ol, blockquote, pre { margin: 1em 0; }
ul, ol { padding-left: 40px; }
li { margin: 0.25em 0; }
blockquote { padding-left: 1em; border-left: 4px solid #ccc; color: #444; }
table { border-collapse: collapse; margin: 1em 0; width: 100%; }
th, td { border: 1px solid #666; padding: 0.4em 0.75em; text-align: left; vertical-align: top; }
th { background: #f5f5f5; font-weight: bold; }
.mm-toc { margin: 1em 0; }
hr { margin: 60px 0; border: 0; border-bottom: 1px solid #666; }
.page-break { page-break-before: always; }`;

export const THEME_PAGE_CSS = `body { font-family: ${THEME_FONT_FAMILY};
       line-height: 1.8; color: #222; max-width: 1080px; margin: auto; padding: 40px 24px; }
${THEME_TYPOGRAPHY_CSS}
@media print {
  body { font-size: 12px; }
  .mm-print-s { max-width: 60% !important; }
  .mm-print-l { max-width: 80% !important; }
  hr.page-break { border-bottom: 0; margin: 0; }
}`;

export const THEME_FIGURE_CSS = `.mm { --mm-color: ${DEFAULT_ANNOTATION_COLOR}; --mm-font-size: ${DEFAULT_ANNOTATION_FONT_SIZE}px;
      position: relative; width: 100%; margin: 0; font-family: ${THEME_FONT_FAMILY}; }
.mm > .mm-obj { position: absolute; }
.mm-image { overflow: hidden; }
.mm-image > img { position: absolute; display: block; max-width: none; }
.mm-badge { width: 22px; height: 22px; border-radius: 50%; background: var(--mm-color); color: #fff; box-shadow: 0 0 0 1px #fff;
            font-weight: bold; font-size: var(--mm-font-size); line-height: 1.5; display: flex;
            justify-content: center; transform: translate(-50%,-50%); }
.mm-text  { box-sizing: border-box; display: flex; flex-direction: column; color: var(--mm-color); font-size: var(--mm-font-size); line-height: 1.45; }
.mm-text > span { display: block; width: 100%; white-space: pre-wrap; overflow-wrap: anywhere; }
.mm-cursor { color: ${DEFAULT_CURSOR_COLOR}; line-height: 0; }
.mm-cursor > svg { display: block; width: 100%; height: 100%; overflow: visible; }
.mm-frame { box-sizing: border-box; border: 2px solid var(--mm-color); }
.mm-lines { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.mm-lines polyline { fill: none; stroke: var(--mm-color); stroke-width: 2; }
.mm-lines marker path { fill: var(--mm-color); }
.mm-border { border: 1px solid #999; }`;

export const THEME_CSS = `${THEME_PAGE_CSS}
${THEME_FIGURE_CSS}`;

/** CSS ルールのセレクタにスコープを付与する(プレビューペイン用)。@media は再帰的に処理する */
export function scopeCss(css: string, scope: string): string {
  return css.replace(/(@media[^{]+)\{([\s\S]*?)\}|([^{}@]+)\{([^{}]*)\}/g, (match, mediaQuery, mediaBody, selectors, body) => {
    if (mediaQuery) {
      return `${mediaQuery}{${scopeCss(mediaBody, scope)}}`;
    }
    const scopedSelectors = String(selectors)
      .split(",")
      .map((selector: string) => {
        const trimmed = selector.trim();
        if (!trimmed) {
          return trimmed;
        }
        return `${scope} ${trimmed}`;
      })
      .join(", ");
    return `${scopedSelectors} {${body}}`;
  });
}

export interface AnnotationTheme {
  color?: string;
  fontSize?: number;
}

// project.yaml の annotation 設定を CSS 変数の上書きに変換する
export function annotationThemeCss(theme: AnnotationTheme): string {
  const vars: string[] = [];
  if (theme.color) {
    vars.push(`--mm-color: ${theme.color};`);
  }
  if (theme.fontSize) {
    vars.push(`--mm-font-size: ${theme.fontSize}px;`);
  }
  return vars.length > 0 ? `.mm { ${vars.join(" ")} }` : "";
}
