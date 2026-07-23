import { expect, type Page } from "@playwright/test";

export const testProject = "example";
export const annotationId = "1-1";

export async function canvasPoint(page: Page, xPct: number, yPct: number) {
  const figure = page.getByTestId("annotation-editor").locator(".mm-editor-figure figure");
  await expect(figure).toBeVisible();
  const box = await figure.boundingBox();
  if (!box) {
    throw new Error("figure has no bounding box");
  }
  return {
    x: box.x + box.width * xPct / 100,
    y: box.y + box.height * yPct / 100,
  };
}

export async function clickCanvas(page: Page, xPct: number, yPct: number) {
  const point = await canvasPoint(page, xPct, yPct);
  await page.mouse.click(point.x, point.y);
}

export async function dragCanvas(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const start = await canvasPoint(page, from.x, from.y);
  const end = await canvasPoint(page, to.x, to.y);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 4 });
  await page.mouse.up();
}
