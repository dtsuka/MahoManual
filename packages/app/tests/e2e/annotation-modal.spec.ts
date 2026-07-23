import { expect, test } from "@playwright/test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  annotationId,
  clickCanvas,
  testProject,
} from "./helpers.js";

// example/1-1.json を複数テストが共有するため、並列実行での汚染を防ぐ
test.describe.configure({ mode: "serial" });

test("manual editor: figure click opens annotation modal and close returns to manual", async ({ page }) => {
  await page.goto(`/projects/${testProject}/manual`);
  await expect(page.locator(".cm-content")).toContainText("アイケア様");

  await page.locator('.preview-pane figure[data-mm-annotation="1-1"]').click();
  await expect(page.getByTestId("annotation-modal")).toBeVisible();
  await expect(page.getByTestId("annotation-editor")).toBeVisible();
  await expect(page).toHaveURL(/\/manual\?annotation=1-1/);

  // md-editor is still in the DOM (not remounted)
  await expect(page.getByTestId("md-editor")).toBeAttached();

  await page.getByTestId("annotation-modal-close").click();
  await expect(page.getByTestId("annotation-modal")).toHaveCount(0);
  await expect(page).toHaveURL(/\/manual$/);
  await expect(page.locator(".cm-content")).toContainText("アイケア様");
});

test("annotation modal: dirty close shows unsaved banner with cancel / save / discard", async ({
  page,
  request,
}) => {
  const annotationPath = join(process.cwd(), "../../projects/example/annotations/1-1.json");
  const before = JSON.parse(readFileSync(annotationPath, "utf8"));
  await page.goto(`/projects/${testProject}/manual`);
  await page.locator('.preview-pane figure[data-mm-annotation="1-1"]').click();
  await expect(page.getByTestId("annotation-modal")).toBeVisible();

  try {
    await page.getByTestId("add-badge").click();
    await clickCanvas(page, 42, 38);
    await expect(page.getByTestId("annotation-modal").getByText("未保存")).toBeVisible();

    await page.getByTestId("annotation-modal-close").click();
    await expect(page.getByTestId("unsaved-nav-banner")).toBeVisible();
    await expect(page.getByTestId("annotation-modal")).toBeVisible();

    await page.getByRole("button", { name: "キャンセル" }).click();
    await expect(page.getByTestId("unsaved-nav-banner")).toHaveCount(0);
    await expect(page.getByTestId("annotation-modal")).toBeVisible();

    await page.getByTestId("annotation-modal-close").click();
    await page.getByTestId("nav-discard-and-go").click();
    await expect(page.getByTestId("annotation-modal")).toHaveCount(0);
    await expect(page).toHaveURL(/\/manual$/);
  } finally {
    await request.put(`/api/projects/${testProject}/annotations/${annotationId}`, { data: before });
  }
});

test("annotation modal: save-and-close persists edits then returns to manual", async ({
  page,
  request,
}) => {
  const annotationPath = join(process.cwd(), "../../projects/example/annotations/1-1.json");
  const before = JSON.parse(readFileSync(annotationPath, "utf8"));
  const marker = `e2e-modal-save-${Date.now()}`;
  await page.goto(`/projects/${testProject}/manual`);
  await page.locator('.preview-pane figure[data-mm-annotation="1-1"]').click();
  await expect(page.getByTestId("annotation-modal")).toBeVisible();

  try {
    await page.getByTestId("add-text").click();
    await clickCanvas(page, 48, 42);
    await page.getByLabel("テキスト内容").fill(marker);
    await page.getByTestId("annotation-modal-close").click();
    await expect(page.getByTestId("unsaved-nav-banner")).toBeVisible();

    const [saveResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes(`/annotations/${annotationId}`) && response.request().method() === "PUT",
      ),
      page.getByTestId("nav-save-and-go").click(),
    ]);
    expect(saveResponse.ok()).toBeTruthy();
    await expect(page.getByTestId("annotation-modal")).toHaveCount(0);
    await expect(page).toHaveURL(/\/manual$/);
    await expect(page.locator(".preview-pane")).toContainText(marker);
  } finally {
    await request.put(`/api/projects/${testProject}/annotations/${annotationId}`, { data: before });
  }
});

test("annotation modal: browser back/forward and direct ?annotation= URL", async ({ page }) => {
  await page.goto(`/projects/${testProject}/manual`);
  await page.locator('.preview-pane figure[data-mm-annotation="1-1"]').click();
  await expect(page.getByTestId("annotation-modal")).toBeVisible();
  await expect(page).toHaveURL(/\/manual\?annotation=1-1/);

  await page.goBack();
  await expect(page.getByTestId("annotation-modal")).toHaveCount(0);
  await expect(page).toHaveURL(/\/manual$/);

  await page.goForward();
  await expect(page.getByTestId("annotation-modal")).toBeVisible();
  await expect(page).toHaveURL(/\/manual\?annotation=1-1/);

  await page.goto(`/projects/${testProject}/manual?annotation=1-1`);
  await expect(page.getByTestId("annotation-modal")).toBeVisible();
  await page.getByTestId("annotation-modal-close").click();
  await expect(page.getByTestId("annotation-modal")).toHaveCount(0);
  await expect(page).toHaveURL(/\/manual$/);
  await expect(page.getByTestId("md-editor")).toBeVisible();
});

test("annotation modal: save syncs preview and live preview without losing dirty markdown", async ({
  page,
  request,
}) => {
  const annotationPath = join(process.cwd(), "../../projects/example/annotations/1-1.json");
  const before = JSON.parse(readFileSync(annotationPath, "utf8"));
  const marker = `e2e-modal-sync-${Date.now()}`;

  await page.goto(`/projects/${testProject}/manual`);
  // フェンスを壊さないよう、見出し行でTOCを挿入してMarkdownをdirtyにする
  await page.getByTestId("md-editor").getByText("アイケア様 施設情報更新マニュアル", { exact: true }).click();
  await page.getByTestId("insert-toc").click();
  await expect(page.locator(".cm-content")).toContainText("<!-- toc -->");

  await page.locator('.preview-pane figure[data-mm-annotation="1-1"]').click();
  await expect(page.getByTestId("annotation-modal")).toBeVisible();

  try {
    const modal = page.getByTestId("annotation-modal");
    await modal.getByTestId("add-text").click();
    await clickCanvas(page, 55, 45);
    await modal.getByLabel("テキスト内容").fill(marker);
    await expect(modal.locator(".mm-editor-figure .mm-text").last()).toContainText(marker);

    const [saveResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes(`/annotations/${annotationId}`) && response.request().method() === "PUT",
      ),
      modal.getByTestId("save-button").click(),
    ]);
    expect(saveResponse.ok()).toBeTruthy();
    await expect(modal.getByText("保存しました")).toBeVisible();

    await modal.getByTestId("annotation-modal-close").click();
    await expect(page.getByTestId("annotation-modal")).toHaveCount(0);
    await expect(page.locator(".cm-content")).toContainText("<!-- toc -->");
    await expect(page.locator(".preview-pane")).toContainText(marker);

    await page.getByTestId("live-preview-toggle").click();
    await expect(page.locator('.cm-live-figure[data-mm-annotation="1-1"]')).toContainText(marker);
  } finally {
    await request.put(`/api/projects/${testProject}/annotations/${annotationId}`, { data: before });
  }
});

test("annotation modal: rename is blocked while markdown is dirty and works when clean", async ({
  page,
  request,
}) => {
  const projectRoot = join(process.cwd(), "../../projects/example");
  const manualPath = join(projectRoot, "manual.md");
  const beforeManual = readFileSync(manualPath, "utf8");
  const id = `e2e-modal-rename-${Date.now()}`;
  const renamedId = `${id}-done`;
  const png =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  const create = await request.post(`/api/projects/${testProject}/images`, {
    data: { id, data: `data:image/png;base64,${png}`, width: 1, height: 1 },
  });
  expect(create.ok()).toBeTruthy();

  const fence = [
    "",
    "```annotated-image",
    `src: ${id}`,
    "width: 400",
    "border: true",
    "alt: modal rename",
    "```",
    "",
  ].join("\n");
  const putManual = await request.put(`/api/projects/${testProject}/manual`, {
    data: { body: `${beforeManual}${fence}` },
  });
  expect(putManual.ok()).toBeTruthy();

  try {
    await page.goto(`/projects/${testProject}/manual`);
    const figure = page.locator(`.preview-pane figure[data-mm-annotation="${id}"]`);
    await expect(figure).toBeVisible();

    await page.getByTestId("md-editor").getByText("アイケア様 施設情報更新マニュアル", { exact: true }).click();
    await page.getByTestId("insert-toc").click();
    await expect(page.locator(".cm-content")).toContainText("<!-- toc -->");

    await figure.click();
    await expect(page.getByTestId("annotation-modal")).toBeVisible();
    await expect(page.getByTestId("rename-id-button")).toBeDisabled();

    await page.getByTestId("annotation-modal-close").click();
    await expect(page.getByTestId("annotation-modal")).toHaveCount(0);
    await page.getByTestId("save-manual").click();
    await expect(page.getByText("manual.md を保存しました")).toBeVisible();

    await figure.click();
    await expect(page.getByTestId("annotation-modal")).toBeVisible();
    await page.getByTestId("rename-id-input").fill(renamedId);
    await expect(page.getByTestId("rename-id-button")).toBeEnabled();
    await page.getByTestId("rename-id-button").click();

    await expect(page).toHaveURL(new RegExp(`/manual\\?annotation=${renamedId}`));
    await expect(page.getByTestId("annotation-modal")).toBeVisible();
    await page.getByTestId("annotation-modal-close").click();
    await expect(page.getByTestId("annotation-modal")).toHaveCount(0);
    await expect(page.locator(".cm-content")).toContainText(`src: ${renamedId}`);
  } finally {
    writeFileSync(manualPath, beforeManual);
    for (const candidate of [id, renamedId]) {
      rmSync(join(projectRoot, `annotations/${candidate}.json`), { force: true });
      rmSync(join(projectRoot, `img/raw/${candidate}.png`), { force: true });
      rmSync(join(projectRoot, `img/${candidate}.png`), { force: true });
    }
  }
});

test("annotation modal: keyboard open, focus trap, Esc priority, focus restore, prev/next", async ({
  page,
}) => {
  await page.goto(`/projects/${testProject}/manual`);
  const figure = page.locator('.preview-pane figure[data-mm-annotation="1-1"]');
  await expect(figure).toBeVisible();
  await figure.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("annotation-modal")).toBeVisible();
  await page.getByTestId("annotation-modal-close").click();
  await expect(page.getByTestId("annotation-modal")).toHaveCount(0);

  await figure.focus();
  await page.keyboard.press(" ");
  await expect(page.getByTestId("annotation-modal")).toBeVisible();
  await expect(page.getByTestId("annotation-modal")).toBeFocused();

  const modal = page.getByTestId("annotation-modal");
  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press("Tab");
    await expect
      .poll(async () =>
        modal.evaluate((el) => el.contains(document.activeElement)),
      )
      .toBe(true);
  }
  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press("Shift+Tab");
    await expect
      .poll(async () =>
        modal.evaluate((el) => el.contains(document.activeElement)),
      )
      .toBe(true);
  }

  await page.getByTestId("add-line").click();
  await clickCanvas(page, 20, 20);
  await expect(page.getByTestId("creation-preview")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("creation-preview")).toHaveCount(0);
  await expect(page.getByTestId("annotation-modal")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("annotation-modal")).toHaveCount(0);

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const active = document.activeElement;
        return active instanceof HTMLElement && active.dataset.mmAnnotation === "1-1";
      }),
    )
    .toBe(true);

  await figure.click();
  await expect(page.getByTestId("annotation-modal")).toBeVisible();
  await page.getByTestId("nav-next-annotation").click();
  await expect(page.getByTestId("annotation-modal")).toBeVisible();
  await expect(page).toHaveURL(/\/manual\?annotation=1-2/);
  await expect(page.getByTestId("md-editor")).toBeAttached();
  await page.getByTestId("nav-prev-annotation").click();
  await expect(page).toHaveURL(/\/manual\?annotation=1-1/);
  await expect(page.getByTestId("annotation-modal")).toBeVisible();
});

test("annotation modal: independent annotation URL and project import stay full-page", async ({
  page,
}) => {
  await page.goto(`/projects/${testProject}/annotations/${annotationId}`);
  await expect(page.getByTestId("annotation-editor")).toBeVisible();
  await expect(page.getByTestId("annotation-modal")).toHaveCount(0);
  await expect(page.getByTestId("back-to-project")).toBeVisible();

  await page.goto(`/projects/${testProject}`);
  await page.getByTestId(`annotation-link-${annotationId}`).click();
  await expect(page).toHaveURL(`/projects/${testProject}/annotations/${annotationId}`);
  await expect(page.getByTestId("annotation-editor")).toBeVisible();
  await expect(page.getByTestId("annotation-modal")).toHaveCount(0);

  const projectRoot = join(process.cwd(), "../../projects/example");
  const newId = `e2e-modal-import-${Date.now()}`;
  try {
    await page.goto(`/projects/${testProject}`);
    await page.getByTestId("import-id-input").fill(newId);
    await page
      .getByTestId("import-file-input")
      .setInputFiles(join(projectRoot, "img/raw/1-1.png"));
    await expect(page.getByTestId("annotation-editor")).toBeVisible();
    await expect(page).toHaveURL(`/projects/${testProject}/annotations/${newId}`);
    await expect(page.getByTestId("annotation-modal")).toHaveCount(0);
  } finally {
    rmSync(join(projectRoot, `annotations/${newId}.json`), { force: true });
    rmSync(join(projectRoot, `img/raw/${newId}.png`), { force: true });
    rmSync(join(projectRoot, `img/${newId}.png`), { force: true });
  }
});

