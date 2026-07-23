import { expect, test } from "@playwright/test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { testProject } from "./helpers.js";

test("project home: importing an image creates annotation skeleton and opens the editor", async ({
  page,
}) => {
  const projectRoot = join(process.cwd(), "../../projects/example");
  const newId = `e2e-import-${Date.now()}`;
  await page.goto(`/projects/${testProject}`);

  try {
    await page.getByTestId("import-id-input").fill(newId);
    await page
      .getByTestId("import-file-input")
      .setInputFiles(join(projectRoot, "img/raw/1-1.png"));

    // 取り込み後は注釈エディタへ直行する
    await expect(page.getByTestId("annotation-editor")).toBeVisible();
    await expect(page.locator(".mm-editor-figure figure")).toBeVisible();

    expect(existsSync(join(projectRoot, `annotations/${newId}.json`))).toBe(true);
    expect(existsSync(join(projectRoot, `img/raw/${newId}.png`))).toBe(true);
    const annotation = JSON.parse(
      readFileSync(join(projectRoot, `annotations/${newId}.json`), "utf8"),
    ) as { objects: Array<{ type: string; src?: string }> };
    expect(annotation.objects[0]?.type).toBe("image");
    expect(annotation.objects[0]?.src).toBe(`img/raw/${newId}.png`);
  } finally {
    rmSync(join(projectRoot, `annotations/${newId}.json`), { force: true });
    rmSync(join(projectRoot, `img/raw/${newId}.png`), { force: true });
    rmSync(join(projectRoot, `img/${newId}.png`), { force: true });
  }
});

test("project page: annotation id can be renamed from the annotation list", async ({
  page,
  request,
}) => {
  const id = `e2e-list-rename-${Date.now()}`;
  const renamedId = `${id}-done`;
  const png =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const create = await request.post(`/api/projects/${testProject}/images`, {
    data: { id, data: `data:image/png;base64,${png}`, width: 1, height: 1 },
  });
  expect(create.ok()).toBeTruthy();

  await page.goto(`/projects/${testProject}`);
  await expect(page.getByTestId(`annotation-link-${id}`)).toBeVisible();

  try {
    await page.getByTestId(`rename-list-input-${id}`).fill(renamedId);
    await page.getByTestId(`rename-list-button-${id}`).click();
    await expect(page.getByTestId(`annotation-link-${renamedId}`)).toBeVisible();
    await expect(page.getByTestId(`annotation-link-${id}`)).toHaveCount(0);
  } finally {
    const projectRoot = join(process.cwd(), "../../projects/example");
    for (const candidate of [id, renamedId]) {
      rmSync(join(projectRoot, `annotations/${candidate}.json`), { force: true });
      rmSync(join(projectRoot, `img/raw/${candidate}.png`), { force: true });
      rmSync(join(projectRoot, `img/${candidate}.png`), { force: true });
    }
  }
});

test("project list: a project can be created and opened", async ({ page }) => {
  const id = `e2e-project-${Date.now()}`;
  const title = "E2E 新規マニュアル";
  const root = join(process.cwd(), `../../projects/${id}`);
  await page.goto("/");

  try {
    await page.getByTestId("new-project-id").fill(id);
    await page.getByTestId("new-project-title").fill(title);
    await page.getByTestId("create-project").click();

    await expect(page).toHaveURL(`/projects/${id}`);
    await expect(page.getByTestId("project-title-heading")).toHaveText(title);
    expect(existsSync(join(root, "manual.md"))).toBe(true);
    expect(readFileSync(join(root, "project.yaml"), "utf8")).toContain(title);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("project page: display title can be updated", async ({ page }) => {
  const before = readFileSync(
    join(process.cwd(), `../../projects/${testProject}/project.yaml`),
    "utf8",
  );
  const nextTitle = `E2E タイトル ${Date.now()}`;
  await page.goto(`/projects/${testProject}`);

  try {
    await page.getByTestId("project-title-input").fill(nextTitle);
    await page.getByTestId("project-title-save").click();
    await expect(page.getByTestId("project-title-saved")).toBeVisible();
    await expect(page.getByTestId("project-title-heading")).toHaveText(nextTitle);
    expect(
      readFileSync(join(process.cwd(), `../../projects/${testProject}/project.yaml`), "utf8"),
    ).toContain(nextTitle);
  } finally {
    writeFileSync(
      join(process.cwd(), `../../projects/${testProject}/project.yaml`),
      before,
      "utf8",
    );
  }
});

test("project page: HTML and PDF can be downloaded", async ({ page }) => {
  await page.goto(`/projects/${testProject}`);

  const htmlDownloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-html").click();
  const htmlDownload = await htmlDownloadPromise;
  expect(htmlDownload.suggestedFilename()).toBe(`${testProject}.html`);

  const pdfDownloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-pdf").click();
  const pdfDownload = await pdfDownloadPromise;
  expect(pdfDownload.suggestedFilename()).toBe(`${testProject}.pdf`);
});
