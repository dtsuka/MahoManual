import { describe, expect, it } from "vitest";
import {
  formatAnnotatedImageFence,
  formatTocMarker,
  TOC_MARKER,
} from "../src/lib/manual-insert.js";

describe("formatTocMarker", () => {
  it("returns the toc HTML comment marker with surrounding newlines", () => {
    expect(formatTocMarker()).toBe(`\n${TOC_MARKER}\n`);
  });
});

describe("formatAnnotatedImageFence", () => {
  it("builds a default annotated-image fence", () => {
    expect(formatAnnotatedImageFence("1-1")).toBe(
      "\n```annotated-image\nsrc: 1-1\nwidth: 1000\nborder: true\n```\n",
    );
  });

  it("includes optional alt text", () => {
    expect(formatAnnotatedImageFence("info-list", { alt: "お知らせ一覧" })).toContain(
      "alt: お知らせ一覧",
    );
  });
});
