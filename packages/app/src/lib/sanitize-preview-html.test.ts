// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderFigure } from "@mahomanual/core/render";
import type { AnnotationFile } from "@mahomanual/core/schema";
import { extractAnnotatedFigures } from "./live-preview.js";
import { sanitizePreviewHtml } from "./sanitize-preview-html.js";

function normalize(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template.innerHTML;
}

function sampleAnnotation(): AnnotationFile {
  return {
    version: 1,
    canvas: { width: 1280, height: 960 },
    objects: [
      {
        id: "image-1",
        type: "image",
        source: "manual",
        src: "img/raw/base.png",
        rect: { x: 0, y: 0, w: 100, h: 100 },
        crop: { x: 0, y: 120, w: 1280, h: 960 },
      },
      {
        id: "mosaic-1",
        type: "mosaic",
        source: "manual",
        targetImageId: "image-1",
        rect: { x: 5, y: 5, w: 10, h: 10 },
        blockSize: 12,
      },
      { id: "badge-1", type: "badge", source: "manual", n: 1, at: { x: 17.3, y: 16 } },
      {
        id: "text-1",
        type: "text",
        source: "manual",
        content: "説明 <b>",
        at: { x: 40, y: 40 },
        rect: { x: 40, y: 40, w: 20, h: 10 },
      },
      { id: "cursor-1", type: "cursor", source: "manual", icon: "pointer", at: { x: 60, y: 60 }, size: 28 },
      { id: "frame-1", type: "frame", source: "manual", rect: { x: 0.3, y: 18.4, w: 12.2, h: 3 } },
      {
        id: "arrow-1",
        type: "arrow",
        source: "manual",
        arrowHeads: "both",
        points: [
          { x: 29.5, y: 92 },
          { x: 62, y: 92 },
          { x: 62, y: 2 },
        ],
      },
      {
        id: "line-1",
        type: "line",
        source: "manual",
        points: [
          { x: 10, y: 10 },
          { x: 20, y: 20 },
        ],
      },
    ],
  };
}

function previewFigure(): string {
  const figure = renderFigure(sampleAnnotation(), {
    naturalSizes: { "img/raw/base.png": { w: 1280, h: 1080 } },
    imageSources: { "img/raw/base.png": "/api/projects/p/files/img/raw/base.png" },
    fence: { width: 1000, border: true, caption: "キャプション" },
  });
  return figure.replace("<figure ", '<figure data-mm-annotation="1-1" ');
}

describe("sanitizePreviewHtml", () => {
  it("スクリプト・イベント属性・javascript: URL・iframe を取り除く", () => {
    const html = sanitizePreviewHtml([
      "<h2 id=\"intro\">見出し</h2>",
      "<script>alert(1)</script>",
      '<img src="x" onerror="alert(2)">',
      '<a href="javascript:alert(3)">link</a>',
      '<iframe src="https://example.com"></iframe>',
      '<svg><a href="javascript:alert(4)"><text>t</text></a><script>alert(5)</script></svg>',
      '<div onclick="alert(6)" style="color:red">本文</div>',
    ].join(""));
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/onerror|onclick/i);
    expect(html).not.toMatch(/javascript:/i);
    expect(html).not.toMatch(/<iframe/i);
    expect(html).toContain("見出し");
    expect(html).toContain("本文");
    expect(html).toContain('style="color:red"');
  });

  it("注釈 figure(画像・バッジ・テキスト・カーソル・枠・モザイク・矢印のSVG)はそのまま残す", () => {
    const figure = previewFigure();
    expect(normalize(sanitizePreviewHtml(figure))).toBe(normalize(figure));
  });

  it("目次のリンクと見出しの id を残す", () => {
    const html = [
      '<nav class="mm-toc">\n  <ul>\n    <li><a href="#1-施設情報">1 施設情報</a></li>\n  </ul>\n</nav>',
      '<h2 id="1-施設情報">1 施設情報</h2>',
      "<table><thead><tr><th>項目</th></tr></thead><tbody><tr><td>値</td></tr></tbody></table>",
    ].join("\n");
    expect(normalize(sanitizePreviewHtml(html))).toBe(normalize(html));
  });
});

describe("extractAnnotatedFigures", () => {
  it("ライブプレビューへ渡す figure HTML も無害化する", () => {
    const figures = extractAnnotatedFigures(
      '<figure data-mm-annotation="a"><img src="x" onerror="alert(1)"><span class="mm-obj mm-badge">1</span></figure>',
    );
    const html = figures.get("a") ?? "";
    expect(html).toContain("mm-badge");
    expect(html).not.toMatch(/onerror/i);
  });
});
