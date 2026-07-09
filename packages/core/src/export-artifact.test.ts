import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderManualHtmlDownload, renderManualPdfDownload } from "./export-artifact.js";

const fixtureProject = join(import.meta.dirname, "../tests/fixtures/projects/demo");

describe("manual download artifacts", () => {
  it("renders a single-file HTML download", async () => {
    const html = (await renderManualHtmlDownload(fixtureProject)).toString("utf8");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("data:image/png;base64,");
    expect(html).not.toContain('src="img/');
  });

  it(
    "renders a PDF download",
    async () => {
      const pdf = await renderManualPdfDownload(fixtureProject);
      expect(pdf.subarray(0, 4).toString("ascii")).toBe("%PDF");
      expect(pdf.byteLength).toBeGreaterThan(1_000);
    },
    10_000,
  );
});
