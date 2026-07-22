import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const testProject = "output-settings-e2e";
const projectRoot = join(process.cwd(), `../../projects/${testProject}`);
const projectYamlPath = join(projectRoot, "project.yaml");

test("HTML/PDFの出力ファイル名をプロジェクト画面で設定できる", async ({ page }) => {
  mkdirSync(projectRoot, { recursive: true });
  writeFileSync(projectYamlPath, "title: 出力設定E2E\n", "utf8");
  writeFileSync(join(projectRoot, "manual.md"), "# 出力設定E2E\n", "utf8");
  try {
    await page.goto(`/projects/${testProject}`);

    await expect(page.getByTestId("output-html-filename")).toHaveValue(`${testProject}.html`);
    await expect(page.getByTestId("output-pdf-filename")).toHaveValue(`${testProject}.pdf`);

    await page.getByTestId("output-html-filename").fill("納品マニュアル.html");
    await page.getByTestId("output-pdf-filename").fill("納品マニュアル.pdf");
    await page.getByTestId("output-save").click();

    await expect(page.getByTestId("output-saved")).toHaveText("保存しました");
    await expect(page.getByTestId("export-html")).toHaveAttribute("download", "納品マニュアル.html");
    await expect(page.getByTestId("export-pdf")).toHaveAttribute("download", "納品マニュアル.pdf");
    expect(readFileSync(projectYamlPath, "utf8")).toContain("納品マニュアル.html");
    expect(readFileSync(projectYamlPath, "utf8")).toContain("納品マニュアル.pdf");
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
