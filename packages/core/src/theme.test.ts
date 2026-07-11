import { describe, expect, it } from "vitest";
import {
  annotationThemeCss,
  scopeCss,
  THEME_FIGURE_CSS,
  THEME_PAGE_CSS,
  THEME_TYPOGRAPHY_CSS,
} from "./theme.js";

describe("THEME_FIGURE_CSS", () => {
  it("defines annotation defaults as CSS custom properties", () => {
    expect(THEME_FIGURE_CSS).toContain("--mm-color: #E91E8C");
    expect(THEME_FIGURE_CSS).toContain("--mm-font-size: 14px");
    expect(THEME_FIGURE_CSS).toContain("var(--mm-color)");
    expect(THEME_FIGURE_CSS).toContain('font-family: "Noto Sans JP", sans-serif');
  });

  it("colors text with the default annotation color (not black)", () => {
    const textRule = THEME_FIGURE_CSS.match(/\.mm-text\s*\{[^}]*\}/)?.[0] ?? "";
    expect(textRule).toContain("color: var(--mm-color)");
  });
});

describe("THEME_TYPOGRAPHY_CSS", () => {
  it("restores heading/paragraph spacing and table cell borders", () => {
    expect(THEME_TYPOGRAPHY_CSS).toMatch(/h1\s*\{[^}]*margin:/);
    expect(THEME_TYPOGRAPHY_CSS).toMatch(/h2\s*\{[^}]*margin:/);
    expect(THEME_TYPOGRAPHY_CSS).toMatch(/p\s*,\s*ul\s*,\s*ol[^\{]*\{[^}]*margin:/);
    expect(THEME_TYPOGRAPHY_CSS).toMatch(/th\s*,\s*td\s*\{[^}]*border:\s*1px\s+solid/);
    expect(THEME_PAGE_CSS).toContain(THEME_TYPOGRAPHY_CSS.trim());
  });

  it("scopes typography selectors for the preview pane", () => {
    const scoped = scopeCss(THEME_TYPOGRAPHY_CSS, ".preview-pane");
    expect(scoped).toContain(".preview-pane h1");
    expect(scoped).toContain(".preview-pane th, .preview-pane td");
    expect(scoped).not.toMatch(/(^|\n)h1\s*\{/);
  });
});

describe("annotationThemeCss", () => {
  it("generates .mm variable overrides from theme settings", () => {
    const css = annotationThemeCss({ color: "#112233", fontSize: 16 });
    expect(css).toContain("--mm-color: #112233");
    expect(css).toContain("--mm-font-size: 16px");
    expect(css).toMatch(/^\.mm \{/);
  });

  it("returns an empty string when no settings are given", () => {
    expect(annotationThemeCss({})).toBe("");
  });
});
