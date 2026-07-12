import { expect, test } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const projectYamlPath = join(process.cwd(), "../../projects/example/project.yaml");

test("project home: set and reset default annotation color / font size", async ({ page }) => {
  const originalYaml = readFileSync(projectYamlPath, "utf8");
  try {
    await page.goto("/projects/example");
    await expect(page.getByTestId("theme-color")).toBeVisible();

    // カラーとフォントサイズを変更するとプレビュー(実CSS)に即時反映される
    await page.getByTestId("theme-color").fill("#3366ff");
    await page.getByTestId("theme-font-size").fill("18");
    const badge = page.locator('[data-testid="theme-preview"] .mm-badge');
    await expect(badge).toHaveCSS("background-color", "rgb(51, 102, 255)");
    await expect(badge).toHaveCSS("font-size", "18px");

    // 保存すると project.yaml の annotation セクションに書かれる
    const [saveResponse] = await Promise.all([
      page.waitForResponse(
        (response) => response.url().includes("/theme") && response.request().method() === "PUT",
      ),
      page.getByTestId("theme-save").click(),
    ]);
    expect(saveResponse.ok()).toBeTruthy();
    await expect(page.getByTestId("theme-saved")).toBeVisible();
    const savedYaml = readFileSync(projectYamlPath, "utf8");
    expect(savedYaml).toContain('color: "#3366ff"');
    expect(savedYaml).toContain("fontSize: 18");
    // 既存のタイトルを壊さない
    expect(savedYaml).toContain("アイケア様求人サイト");

    // 既定値に戻して保存すると color / fontSize が消える（defaults 等の他キーは残ってよい）
    await page.getByTestId("theme-reset").click();
    const [resetResponse] = await Promise.all([
      page.waitForResponse(
        (response) => response.url().includes("/theme") && response.request().method() === "PUT",
      ),
      page.getByTestId("theme-save").click(),
    ]);
    expect(resetResponse.ok()).toBeTruthy();
    const resetYaml = readFileSync(projectYamlPath, "utf8");
    expect(resetYaml).not.toContain('color: "#3366ff"');
    expect(resetYaml).not.toContain("fontSize:");
  } finally {
    writeFileSync(projectYamlPath, originalYaml, "utf8");
  }
});
