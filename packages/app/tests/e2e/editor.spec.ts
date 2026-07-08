import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const testProject = "example";
const annotationId = "1-1";

test("annotation editor: add badge, drag, save, external reload", async ({ page, request }) => {
  await page.goto("/");
  await page.getByTestId(`project-${testProject}`).click();
  await page.getByTestId(`annotation-link-${annotationId}`).click();
  await expect(page.getByTestId("annotation-editor")).toBeVisible();

  const before = JSON.parse(
    readFileSync(
      join(process.cwd(), "../../projects/example/annotations/1-1.json"),
      "utf8",
    ),
  ) as { objects: Array<{ id: string; type: string; at?: { x: number; y: number } }> };

  await page.getByTestId("add-badge").click();
  const newBadge = page.locator('[data-mm-id^="b"]').last();
  await expect(newBadge).toBeVisible();
  const badgeId = await newBadge.getAttribute("data-mm-id");
  expect(badgeId).toBeTruthy();

  await newBadge.click();
  const figure = page.locator(".mm-editor-figure figure");
  await newBadge.dragTo(figure, {
    targetPosition: { x: 120, y: 100 },
  });
  await page.waitForTimeout(200);

  const [saveResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes(`/annotations/${annotationId}`) && response.request().method() === "PUT",
    ),
    page.getByTestId("save-button").click(),
  ]);
  expect(saveResponse.ok()).toBeTruthy();

  const afterSave = JSON.parse(
    readFileSync(
      join(process.cwd(), "../../projects/example/annotations/1-1.json"),
      "utf8",
    ),
  ) as { objects: Array<{ id: string; type: string; at?: { x: number; y: number } }> };
  const savedBadge = afterSave.objects.find((obj) => obj.id === badgeId);
  expect(savedBadge?.type).toBe("badge");
  expect(savedBadge?.at?.x).not.toBe(50);

  const externalAt = { x: 77.7, y: 66.6 };
  const externalPayload = {
    ...afterSave,
    objects: afterSave.objects.map((obj) =>
      obj.id === badgeId ? { ...obj, at: externalAt } : obj,
    ),
  };
  const putResponse = await request.put(
    `/api/projects/${testProject}/annotations/${annotationId}`,
    { data: externalPayload },
  );
  expect(putResponse.ok()).toBeTruthy();

  await expect
    .poll(async () => {
      const style = await newBadge.getAttribute("style");
      return style?.includes("77.7%") ?? false;
    })
    .toBeTruthy();

  const restored = {
    ...before,
    objects: before.objects,
  };
  await request.put(`/api/projects/${testProject}/annotations/${annotationId}`, {
    data: restored,
  });
});

test("manual editor: preview and figure click opens annotation editor", async ({ page }) => {
  await page.goto(`/projects/${testProject}/manual`);
  await expect(page.getByTestId("md-editor")).toBeVisible();
  await expect(page.getByTestId("preview-pane")).toBeVisible();
  await page.locator('.preview-pane figure[data-mm-annotation="1-1"]').click();
  await expect(page.getByTestId("annotation-editor")).toBeVisible();
});

test("manual editor: back from annotation editor restores the markdown editor", async ({ page }) => {
  await page.goto(`/projects/${testProject}/manual`);
  await expect(page.locator(".cm-content")).toContainText("アイケア様");

  await page.locator('.preview-pane figure[data-mm-annotation="1-1"]').click();
  await expect(page.getByTestId("annotation-editor")).toBeVisible();

  await page.getByRole("button", { name: "戻る" }).click();
  await expect(page.getByTestId("md-editor")).toBeVisible();
  // 戻った後も CodeMirror が本文を保持して再表示されること(空白にならない)
  await expect(page.locator(".cm-content")).toContainText("アイケア様");
});

test("annotation editor: external change while dirty shows banner instead of discarding edits", async ({
  page,
  request,
}) => {
  await page.goto(`/projects/${testProject}/annotations/${annotationId}`);
  await expect(page.getByTestId("annotation-editor")).toBeVisible();

  const before = JSON.parse(
    readFileSync(join(process.cwd(), "../../projects/example/annotations/1-1.json"), "utf8"),
  ) as { objects: Array<{ id: string }> };

  try {
    // ローカル編集(未保存 = dirty)
    await page.getByTestId("add-badge").click();
    await expect(page.locator("text=未保存")).toBeVisible();

    // 外部から別内容を書き込む
    const external = {
      ...before,
      objects: [
        ...before.objects,
        { id: "ext-badge", type: "badge", source: "manual", n: 99, at: { x: 5, y: 5 } },
      ],
    };
    const putResponse = await request.put(`/api/projects/${testProject}/annotations/${annotationId}`, {
      data: external,
    });
    expect(putResponse.ok()).toBeTruthy();

    // 編集は破棄されず、確認バナーが出る
    await expect(page.getByTestId("external-change-banner")).toBeVisible();

    // 「外部の内容を読み込む」で反映される
    await page.getByTestId("apply-external").click();
    await expect(page.locator('[data-mm-id="ext-badge"]')).toBeVisible();
  } finally {
    await request.put(`/api/projects/${testProject}/annotations/${annotationId}`, { data: before });
  }
});
