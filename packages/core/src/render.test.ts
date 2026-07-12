import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseAnnotation } from "./schema.js";
import { renderFigure } from "./render.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../tests/fixtures/annotations");

describe("renderFigure", () => {
  it("renders SPEC §4.3 example with crop, badges, frame, and arrow", () => {
    const annotation = parseAnnotation(
      JSON.parse(readFileSync(join(fixturesDir, "valid-basic.json"), "utf8")),
    );
    const html = renderFigure(annotation, {
      naturalSizes: {
        "img/raw/facility-add.png": { w: 1280, h: 1080 },
      },
      fence: { width: 1000 },
    });

    expect(html).toContain('aspect-ratio:1280/960');
    expect(html).toContain('max-width:1000px');
    expect(html).toContain("mm-print-l");
    expect(html).toContain('left:17.3%');
    expect(html).toContain('top:16%');
    expect(html).toContain(">1<");
    expect(html).toContain('width:12.2%');
    expect(html).toContain("height:112.5%");
    expect(html).toContain("top:-12.5%");
    expect(html).toContain('viewBox="0 0 1280 960"');
    expect(html).toContain('points="377.6,883.2 793.6,883.2 793.6,19.2 1056,19.2 1056,62.4"');
    expect(html).toContain('marker-end="url(#mm-arrow-a1)"');
    expect(html).not.toContain('type="line"');
  });

  it("renders line without marker-end and arrow with marker-end", () => {
    const annotation = parseAnnotation({
      version: 1,
      canvas: { width: 100, height: 100 },
      objects: [
        {
          id: "l1",
          type: "line",
          source: "manual",
          points: [
            { x: 0, y: 0 },
            { x: 100, y: 100 },
          ],
        },
        {
          id: "a1",
          type: "arrow",
          source: "manual",
          points: [
            { x: 10, y: 10 },
            { x: 90, y: 90 },
          ],
        },
      ],
    });
    const html = renderFigure(annotation, { naturalSizes: {} });

    expect(html).toContain('marker-end="url(#mm-arrow-a1)"');
    expect(html).toMatch(/<polyline[^>]*points="0,0 100,100"[^>]*(?!marker-end)/);
    const lineMatch = html.match(/<polyline points="0,0 100,100"[^/]*\/>/);
    expect(lineMatch?.[0]).not.toContain("marker-end");
  });

  it("renders text as a wrapping textbox when rect is present", () => {
    const annotation = parseAnnotation({
      version: 1,
      canvas: { width: 1000, height: 800 },
      objects: [{
        id: "t1",
        type: "text",
        source: "manual",
        content: "見出し\n説明",
        at: { x: 50, y: 50 },
        rect: { x: 20, y: 30, w: 40, h: 15 },
        textAlign: "center",
        verticalAlign: "middle",
        padding: 8,
        borderColor: "#112233",
        borderWidth: 2,
        borderRadius: 4,
      }],
    });

    const html = renderFigure(annotation, { naturalSizes: {} });
    expect(html).toContain('class="mm-obj mm-text"');
    expect(html).toContain("left:20%");
    expect(html).toContain("top:30%");
    expect(html).toContain("width:40%");
    expect(html).toContain("height:15%");
    expect(html).toContain("text-align:center");
    expect(html).toContain("justify-content:center");
    expect(html).toContain("padding:8px");
    expect(html).toContain("border:2px solid #112233");
    expect(html).toContain("border-radius:4px");
    expect(html).toContain("見出し");
  });

  it("renders arrow heads at start, end, or both", () => {
    const base = {
      version: 1 as const,
      canvas: { width: 100, height: 100 },
      objects: [
        {
          id: "a1",
          type: "arrow" as const,
          source: "manual" as const,
          points: [
            { x: 0, y: 0 },
            { x: 100, y: 100 },
          ],
        },
      ],
    };

    const endOnly = renderFigure(parseAnnotation(base), { naturalSizes: {} });
    expect(endOnly).toContain('marker-end="url(#mm-arrow-a1)"');
    expect(endOnly).not.toContain("marker-start");

    const startOnly = renderFigure(
      parseAnnotation({ ...base, objects: [{ ...base.objects[0]!, arrowHeads: "start" }] }),
      { naturalSizes: {} },
    );
    expect(startOnly).toContain('marker-start="url(#mm-arrow-a1-start)"');
    expect(startOnly).toContain('orient="auto-start-reverse"');
    expect(startOnly).not.toContain("marker-end");

    const both = renderFigure(
      parseAnnotation({ ...base, objects: [{ ...base.objects[0]!, arrowHeads: "both" }] }),
      { naturalSizes: {} },
    );
    expect(both).toContain('marker-start="url(#mm-arrow-a1-start)"');
    expect(both).toContain('marker-end="url(#mm-arrow-a1)"');
  });

  it("tags polylines with data-mm-id so the GUI can select lines/arrows", () => {
    const annotation = parseAnnotation({
      version: 1,
      canvas: { width: 100, height: 100 },
      objects: [
        {
          id: "l1",
          type: "line",
          source: "manual",
          points: [
            { x: 0, y: 0 },
            { x: 100, y: 100 },
          ],
        },
        {
          id: "a1",
          type: "arrow",
          source: "manual",
          points: [
            { x: 10, y: 10 },
            { x: 90, y: 90 },
          ],
        },
      ],
    });
    const html = renderFigure(annotation, { naturalSizes: {} });

    expect(html).toContain('data-mm-id="l1"');
    expect(html).toContain('data-mm-id="a1"');
  });

  it("relies on theme CSS variables for default colors (no inline defaults)", () => {
    const annotation = parseAnnotation({
      version: 1,
      canvas: { width: 100, height: 100 },
      objects: [
        { id: "f1", type: "frame", source: "manual", rect: { x: 10, y: 10, w: 20, h: 10 } },
        {
          id: "l1",
          type: "line",
          source: "manual",
          points: [
            { x: 0, y: 0 },
            { x: 100, y: 100 },
          ],
        },
        { id: "a1", type: "arrow", source: "manual", points: [{ x: 0, y: 0 }, { x: 50, y: 50 }] },
      ],
    });
    const html = renderFigure(annotation, { naturalSizes: {} });

    // 未指定時は inline を出さず、テーマ CSS(var(--mm-color) 等)に任せる
    const frame = html.match(/<span class="mm-obj mm-frame"[^>]*>/)?.[0] ?? "";
    expect(frame).not.toContain("border");
    expect(html).not.toContain('stroke="');
    expect(html).not.toContain('fill="#');
  });

  it("emits inline styles only for explicitly specified colors and widths", () => {
    const annotation = parseAnnotation({
      version: 1,
      canvas: { width: 100, height: 100 },
      objects: [
        {
          id: "f1",
          type: "frame",
          source: "manual",
          rect: { x: 10, y: 10, w: 20, h: 10 },
          color: "#FF0000",
        },
        {
          id: "l1",
          type: "line",
          source: "manual",
          points: [
            { x: 0, y: 0 },
            { x: 100, y: 100 },
          ],
          color: "#00FF00",
          strokeWidth: 4,
        },
        { id: "b1", type: "badge", source: "manual", n: 1, at: { x: 5, y: 5 }, fontSize: 18 },
      ],
    });
    const html = renderFigure(annotation, { naturalSizes: {} });

    // color のみ指定の frame: 線幅は既定 2px、色はインラインで上書き
    expect(html).toContain("border:2px solid #FF0000");
    // line の指定色・太さは style 属性で(CSS の var 既定に勝つように)
    expect(html).toMatch(/<polyline[^>]*style="stroke:#00FF00; stroke-width:4"/);
    // badge の fontSize
    expect(html).toContain("font-size:18px");
  });

  it("applies fence options: mm-print-s, mm-border, figcaption", () => {
    const annotation = parseAnnotation(
      JSON.parse(readFileSync(join(fixturesDir, "valid-minimal.json"), "utf8")),
    );
    const html = renderFigure(annotation, {
      naturalSizes: {},
      fence: { width: 680, border: true, caption: "テストキャプション" },
    });

    expect(html).toContain("mm-print-s");
    expect(html).not.toContain("mm-print-l");
    expect(html).toContain("mm-border");
    expect(html).toContain("<figcaption>テストキャプション</figcaption>");
  });

  it("renders cursor icons as self-contained inline SVG", () => {
    const annotation = parseAnnotation({
      version: 1,
      canvas: { width: 100, height: 100 },
      objects: [
        {
          id: "c1",
          type: "cursor",
          source: "manual",
          icon: "pointer",
          at: { x: 20, y: 30 },
          size: 28,
          color: "#123456",
        },
      ],
    });
    const html = renderFigure(annotation, { naturalSizes: {} });

    expect(html).toContain('class="mm-obj mm-cursor"');
    expect(html).toContain("left:20%");
    expect(html).toContain("top:30%");
    expect(html).toContain("width:28px");
    expect(html).toContain("color:#123456");
    expect(html).toContain('<svg viewBox="0 0 24 24"');
    expect(html).toContain("<path ");
    expect(html).not.toMatch(/(?:href|src)="https?:/);
    expect(html).not.toContain("<use");
  });

  it("uses black as the default cursor color while allowing an explicit override", () => {
    const annotation = parseAnnotation({
      version: 1,
      canvas: { width: 100, height: 100 },
      objects: [
        { id: "c1", type: "cursor", source: "manual", icon: "pointer", at: { x: 10, y: 10 } },
        {
          id: "c2",
          type: "cursor",
          source: "manual",
          icon: "move",
          at: { x: 20, y: 20 },
          color: "#123456",
        },
      ],
    });
    const html = renderFigure(annotation, { naturalSizes: {} });

    expect(html).toMatch(/data-cursor-icon="pointer"[^>]*color:#000000/);
    expect(html).toMatch(/data-cursor-icon="move"[^>]*color:#123456/);
  });

  it("renders a mosaic preview immediately above its target image", () => {
    const annotation = parseAnnotation({
      version: 1,
      canvas: { width: 100, height: 100 },
      objects: [
        {
          id: "m1",
          type: "mosaic",
          source: "manual",
          targetImageId: "img-main",
          rect: { x: 20, y: 30, w: 40, h: 10 },
          blockSize: 9,
        },
        {
          id: "img-main",
          type: "image",
          source: "manual",
          src: "img/raw/a.png",
          rect: { x: 0, y: 0, w: 100, h: 100 },
        },
        { id: "b1", type: "badge", source: "manual", n: 1, at: { x: 50, y: 50 } },
      ],
    });
    const html = renderFigure(annotation, {
      naturalSizes: { "img/raw/a.png": { w: 100, h: 100 } },
    });
    const imageIndex = html.indexOf("mm-image");
    const mosaicIndex = html.indexOf("mm-mosaic");
    const badgeIndex = html.indexOf("mm-badge");
    expect(imageIndex).toBeGreaterThan(-1);
    expect(mosaicIndex).toBeGreaterThan(imageIndex);
    expect(badgeIndex).toBeGreaterThan(mosaicIndex);
    expect(html).toContain("--mm-mosaic-size:9px");
  });
});
