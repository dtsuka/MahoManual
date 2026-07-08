import { describe, expect, it } from "vitest";
import { annotationThemeCss, THEME_FIGURE_CSS } from "./theme.js";

describe("THEME_FIGURE_CSS", () => {
  it("defines annotation defaults as CSS custom properties", () => {
    expect(THEME_FIGURE_CSS).toContain("--mm-color: #E91E8C");
    expect(THEME_FIGURE_CSS).toContain("--mm-font-size: 14px");
    expect(THEME_FIGURE_CSS).toContain("var(--mm-color)");
  });

  it("colors text with the default annotation color (not black)", () => {
    const textRule = THEME_FIGURE_CSS.match(/\.mm-text\s*\{[^}]*\}/)?.[0] ?? "";
    expect(textRule).toContain("color: var(--mm-color)");
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
