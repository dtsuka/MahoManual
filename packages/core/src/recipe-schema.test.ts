import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseRecipe } from "./schema.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../tests/fixtures/recipes");

describe("parseRecipe", () => {
  it("parses SPEC §9.1 YAML example", () => {
    const yaml = readFileSync(join(fixturesDir, "valid-basic.yaml"), "utf8");
    const recipe = parseRecipe(yaml);
    expect(recipe.url).toContain("edit-tags.php");
    expect(recipe.viewport).toEqual({ width: 1280, height: 900 });
    expect(recipe.steps).toHaveLength(4);
    expect(recipe.screenshot.target).toBe("fullPage");
    expect(recipe.output).toBe("1-1");
    expect(recipe.annotate).toHaveLength(3);
  });

  it("rejects missing url", () => {
    expect(() => parseRecipe("output: test\nscreenshot:\n  target: fullPage\n")).toThrow(/url/i);
  });

  it("rejects unknown step type", () => {
    expect(() =>
      parseRecipe("url: /\nscreenshot:\n  target: fullPage\noutput: x\nsteps:\n  - scroll: body\n"),
    ).toThrow(/step/i);
  });

  it("rejects invalid screenshot target", () => {
    expect(() =>
      parseRecipe("url: /\noutput: x\nscreenshot:\n  target: {}\n"),
    ).toThrow(/target/i);
  });

  it("parses screenshot.margin (SPEC §4.5)", () => {
    const recipe = parseRecipe(
      "url: /\noutput: x\nscreenshot:\n  target: fullPage\n  margin: { left: 60, top: 10 }\n",
    );
    expect(recipe.screenshot.margin).toEqual({ left: 60, top: 10 });
  });

  it("rejects non-numeric screenshot.margin", () => {
    expect(() =>
      parseRecipe(
        "url: /\noutput: x\nscreenshot:\n  target: fullPage\n  margin: { left: wide }\n",
      ),
    ).toThrow(/margin/i);
  });
});
