import { expect, test } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const projectYamlPath = join(process.cwd(), "../../projects/example/project.yaml");

test("HTML/PDFの出力ファイル名をプロジェクト画面で設定できる", async ({ page }) => {
  const before = readFileSync(projectYamlPath, "utf8");
  try {
    await page.goto("/projects/example");

    await expect(page.getByTestId("output-html-filename")).toHaveValue("example.html");
    await expect(page.getByTestId("output-pdf-filename")).toHaveValue("example.pdf");

    await page.getByTestId("output-html-filename").fill("納品マニュアル.html");
    await page.getByTestId("output-pdf-filename").fill("納品マニュアル.pdf");
    await page.getByTestId("output-save").click();

    await expect(page.getByTestId("output-saved")).toHaveText("保存しました");
    await expect(page.getByTestId("export-html")).toHaveAttribute("download", "納品マニュアル.html");
    await expect(page.getByTestId("export-pdf")).toHaveAttribute("download", "納品マニュアル.pdf");
    expect(readFileSync(projectYamlPath, "utf8")).toContain("納品マニュアル.html");
    expect(readFileSync(projectYamlPath, "utf8")).toContain("納品マニュアル.pdf");
  } finally {
    writeFileSync(projectYamlPath, before, "utf8");
  }
});
