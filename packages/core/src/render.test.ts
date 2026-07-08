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
});
