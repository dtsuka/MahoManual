import DOMPurify from "dompurify";

/**
 * サーバーが返すプレビューHTML(manual.md の生HTMLを含む)を、画面へ挿入する前に無害化する。
 * DOMPurify の既定の許可リストで script・イベント属性・javascript: URL・iframe などを除き、
 * 注釈 figure が使う要素(img / svg / marker / polyline / path / circle)、
 * style 属性・data-* 属性・marker-end の url(#…) はそのまま残す。
 */
export function sanitizePreviewHtml(html: string): string {
  if (!html) {
    return "";
  }
  if (!DOMPurify.isSupported) {
    // DOM が無い環境では無害化できないため、何も表示しない
    return "";
  }
  return DOMPurify.sanitize(html);
}
