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

export const THEME_PAGE_CSS = `body { font-family: -apple-system, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif;
       line-height: 1.8; color: #222; max-width: 1080px; margin: auto; padding: 40px 24px; }
hr { margin: 60px 0; border: 0; border-bottom: 1px solid #666; }
.page-break { page-break-before: always; }
@media print {
  body { font-size: 12px; }
  .mm-print-s { max-width: 60% !important; }
  .mm-print-l { max-width: 80% !important; }
  hr.page-break { border-bottom: 0; margin: 0; }
}`;

export const THEME_FIGURE_CSS = `.mm { --mm-color: ${DEFAULT_ANNOTATION_COLOR}; --mm-font-size: ${DEFAULT_ANNOTATION_FONT_SIZE}px;
      position: relative; width: 100%; margin: 0; }
.mm > .mm-obj { position: absolute; }
.mm-image { overflow: hidden; }
.mm-image > img { position: absolute; display: block; max-width: none; }
.mm-badge { width: 22px; height: 22px; border-radius: 50%; background: var(--mm-color); color: #fff;
            font-weight: bold; font-size: var(--mm-font-size); display: flex; align-items: center;
            justify-content: center; transform: translate(-50%,-50%); }
.mm-text  { transform: translate(-50%,-50%); white-space: pre; color: var(--mm-color); font-size: var(--mm-font-size); }
.mm-cursor { color: ${DEFAULT_CURSOR_COLOR}; line-height: 0; }
.mm-cursor > svg { display: block; width: 100%; height: 100%; overflow: visible; }
.mm-frame { box-sizing: border-box; border: 2px solid var(--mm-color); }
.mm-lines { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.mm-lines polyline { fill: none; stroke: var(--mm-color); stroke-width: 2; }
.mm-lines marker path { fill: var(--mm-color); }
.mm-border { border: 1px solid #999; }`;

export const THEME_CSS = `${THEME_PAGE_CSS}
${THEME_FIGURE_CSS}`;

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
