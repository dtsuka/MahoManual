// 納品 HTML へ埋め込むテーマ CSS。
// ページ全体のスタイル(body / hr / 印刷)と figure(.mm 系)を分離し、
// GUI エディタは THEME_FIGURE_CSS のみを再利用する(手書き複製を禁止)

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

export const THEME_FIGURE_CSS = `.mm { position: relative; width: 100%; margin: 0; }
.mm > .mm-obj { position: absolute; }
.mm-image { overflow: hidden; }
.mm-image > img { position: absolute; display: block; max-width: none; }
.mm-badge { width: 22px; height: 22px; border-radius: 50%; background: #E91E8C; color: #fff;
            font-weight: bold; font-size: 14px; display: flex; align-items: center;
            justify-content: center; transform: translate(-50%,-50%); }
.mm-text  { transform: translate(-50%,-50%); white-space: pre; }
.mm-frame { box-sizing: border-box; }
.mm-lines { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.mm-border { border: 1px solid #999; }`;

export const THEME_CSS = `${THEME_PAGE_CSS}
${THEME_FIGURE_CSS}`;
