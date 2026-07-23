import { expect, test } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { annotationId, testProject } from "./helpers.js";

// example/manual.md と 1-1.json を複数テストが共有するため、並列実行での汚染を防ぐ
test.describe.configure({ mode: "serial" });

test("manual editor: preview and figure click opens annotation editor", async ({ page }) => {
  await page.goto(`/projects/${testProject}/manual`);
  await expect(page.getByTestId("md-editor")).toBeVisible();
  await expect(page.getByTestId("preview-pane")).toBeVisible();
  await page.locator('.preview-pane figure[data-mm-annotation="1-1"]').click();
  await expect(page.getByTestId("annotation-editor")).toBeVisible();
});

test("manual editor: live preview renders markdown and annotated images inside CodeMirror", async ({
  page,
}) => {
  await page.goto(`/projects/${testProject}/manual`);

  await page.getByTestId("live-preview-toggle").click();

  await expect(page.getByTestId("md-editor")).toHaveAttribute("data-live-preview", "true");
  await expect(page.locator(".cm-live-heading-1")).toContainText("アイケア様");
  await expect(
    page.locator('.cm-live-figure[data-mm-annotation="1-1"]'),
  ).toBeVisible();
  await expect(page.locator(".cm-content")).not.toContainText("```annotated-image");
});

test("manual editor: ArrowUp enters image source without jumping over the block widget", async ({
  page,
}) => {
  await page.goto(`/projects/${testProject}/manual`);
  await page.getByTestId("live-preview-toggle").click();

  const figure = page.locator('.cm-live-figure[data-mm-annotation="1-1"]');
  await expect(figure).toBeVisible();
  await expect
    .poll(() =>
      figure.evaluate((element) => {
        const style = getComputedStyle(element);
        return [style.marginTop, style.marginBottom];
      }),
    )
    .toEqual(["0px", "0px"]);

  await page
    .getByTestId("md-editor")
    .getByText("左メニューの求人情報 > 施設情報から追加できます。", { exact: true })
    .click();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");

  await expect(page.locator(".cm-content")).toContainText("```annotated-image");
});

test("manual editor: live preview can reveal source and return to source mode", async ({ page }) => {
  await page.goto(`/projects/${testProject}/manual`);
  await page.getByTestId("live-preview-toggle").click();

  await page
    .locator('.cm-live-figure[data-mm-annotation="1-1"]')
    .getByRole("button", { name: "Markdownを編集" })
    .click();
  await expect(page.locator(".cm-content")).toContainText("```annotated-image");

  await page.getByTestId("live-preview-toggle").click();
  await expect(page.getByTestId("md-editor")).toHaveAttribute("data-live-preview", "false");
  await expect(page.locator(".cm-content")).toContainText("```annotated-image");
});

test("manual editor: clicking an annotated image in live preview opens its editor", async ({
  page,
}) => {
  await page.goto(`/projects/${testProject}/manual`);
  await page.getByTestId("live-preview-toggle").click();

  await page.locator('.cm-live-figure[data-mm-annotation="1-1"] figure').click();

  await expect(page.getByTestId("annotation-editor")).toBeVisible();
});

test("manual editor: HTML and PDF can be downloaded", async ({ page }) => {
  await page.goto(`/projects/${testProject}/manual`);

  const htmlDownloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-html").click();
  const htmlDownload = await htmlDownloadPromise;
  expect(htmlDownload.suggestedFilename()).toBe(`${testProject}.html`);

  const pdfDownloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-pdf").click();
  const pdfDownload = await pdfDownloadPromise;
  expect(pdfDownload.suggestedFilename()).toBe(`${testProject}.pdf`);
});

test("manual editor: status notifications do not resize the editor panes", async ({ page }) => {
  await page.goto(`/projects/${testProject}/manual`);
  await expect(page.getByTestId("md-editor")).toBeVisible();

  const editor = page.getByTestId("md-editor");
  const before = await editor.boundingBox();
  if (!before) {
    throw new Error("md-editor has no bounding box");
  }
  await page.getByTestId("save-manual").click();
  await expect(page.getByText("manual.md を保存しました")).toBeVisible();
  const during = await editor.boundingBox();
  if (!during) {
    throw new Error("md-editor has no bounding box after status");
  }
  expect(Math.abs(during.height - before.height)).toBeLessThan(1);
  expect(Math.abs(during.y - before.y)).toBeLessThan(1);
});

test("manual editor: Cmd/Ctrl+S saves from the markdown editor", async ({ page }) => {
  const manualPath = join(process.cwd(), "../../projects/example/manual.md");
  const before = readFileSync(manualPath, "utf8");
  const marker = `<!-- e2e-manual-save-${Date.now()} -->`;

  try {
    await page.goto(`/projects/${testProject}/manual`);
    await page.locator(".cm-content").click();
    await page.keyboard.type(marker);

    const saveResponsePromise = page.waitForResponse(
      (response) => response.url().includes("/manual") && response.request().method() === "PUT",
    );
    await page.keyboard.press("Control+s");
    expect((await saveResponsePromise).ok()).toBeTruthy();
    await expect(page.getByText("manual.md を保存しました")).toBeVisible();
    expect(readFileSync(manualPath, "utf8")).toContain(marker);
  } finally {
    writeFileSync(manualPath, before, "utf8");
  }
});

test("manual editor: insert TOC marker at cursor", async ({ page }) => {
  await page.goto(`/projects/${testProject}/manual`);
  await page.locator(".cm-content").click();
  await page.getByTestId("insert-toc").click();
  await expect(page.locator(".cm-content")).toContainText("<!-- toc -->");
});

test("manual editor: insert existing annotated image at cursor", async ({ page }) => {
  await page.goto(`/projects/${testProject}/manual`);
  await page.locator(".cm-content").click();
  await page.getByTestId("insert-image").click();
  await page.getByTestId("insert-image-select").selectOption(annotationId);
  await page.getByTestId("insert-image-existing").click();
  await expect(page.locator(".cm-content")).toContainText("```annotated-image");
  await expect(page.locator(".cm-content")).toContainText(`src: ${annotationId}`);
});
