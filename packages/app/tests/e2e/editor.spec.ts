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
