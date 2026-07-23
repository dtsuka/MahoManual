import { expect, test } from "@playwright/test";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  annotationId,
  canvasPoint,
  clickCanvas,
  dragCanvas,
  testProject,
} from "./helpers.js";

// example/1-1.json を複数テストが共有するため、並列実行での汚染を防ぐ
test.describe.configure({ mode: "serial" });

test("annotation editor: header navigation actions show text labels", async ({ page }) => {
  await page.goto(`/projects/${testProject}/annotations/${annotationId}`);
  await expect(page.getByTestId("annotation-editor")).toBeVisible();

  await expect(page.getByTestId("back-to-project")).toContainText("戻る");
  await expect(page.getByTestId("nav-prev-annotation")).toContainText("前の注釈");
  await expect(page.getByTestId("nav-next-annotation")).toContainText("次の注釈");
});

test("annotation editor: tools create objects directly on the canvas", async ({ page, request }) => {
  const annotationPath = join(process.cwd(), "../../projects/example/annotations/1-1.json");
  const before = JSON.parse(readFileSync(annotationPath, "utf8")) as {
    objects: Array<{ id: string; type: string; n?: number }>;
  };
  await page.goto(`/projects/${testProject}/annotations/${annotationId}`);
  await expect(page.getByTestId("annotation-editor")).toBeVisible();

  try {
    const objectItems = page.locator('[data-testid^="object-item-"]');
    const initialCount = await objectItems.count();
    const maxBadge = Math.max(0, ...before.objects.filter((obj) => obj.type === "badge").map((obj) => obj.n ?? 0));

    await expect(page.getByTestId("tool-select")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("add-badge").click();
    await expect(page.getByTestId("add-badge")).toHaveAttribute("aria-pressed", "true");
    await expect(objectItems).toHaveCount(initialCount);

    const previewPoint = await canvasPoint(page, 24, 18);
    await page.mouse.move(previewPoint.x, previewPoint.y);
    await expect(page.getByTestId("creation-preview")).toBeVisible();
    await page.mouse.click(previewPoint.x, previewPoint.y);
    await expect(objectItems).toHaveCount(initialCount + 1);
    await expect(page.getByTestId("prop-at-x")).toHaveValue(/24/);
    await expect(page.getByTestId("prop-at-y")).toHaveValue(/18/);
    await expect(page.getByTestId("add-badge")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".mm-editor-figure .mm-badge").last()).toHaveText(String(maxBadge + 1));

    await clickCanvas(page, 36, 28);
    await expect(objectItems).toHaveCount(initialCount + 2);
    await expect(page.locator(".mm-editor-figure .mm-badge").last()).toHaveText(String(maxBadge + 2));

    await page.getByTestId("add-text").click();
    await clickCanvas(page, 42, 32);
    await expect(objectItems).toHaveCount(initialCount + 3);
    await expect(page.getByTestId("prop-rect-x")).toHaveValue(/42/);
    await expect(page.getByTestId("prop-rect-y")).toHaveValue(/32/);
    const text = page.locator(".mm-editor-figure .mm-text").last();
    await expect(text).toHaveAttribute("style", /width:/);
    await expect(text).toHaveAttribute("style", /height:/);
    await text.dblclick();
    const inlineEditor = page.getByTestId("inline-text-editor");
    await expect(inlineEditor).toBeVisible();
    await inlineEditor.click({ position: { x: 110, y: 10 } });
    const caretPosition = await inlineEditor.evaluate((element) => (element as HTMLTextAreaElement).selectionStart ?? 0);
    expect(caretPosition).toBeGreaterThan(0);
    await inlineEditor.fill("キャンバス編集");
    await inlineEditor.press("Control+Enter");
    await expect(text).toContainText("キャンバス編集");
    await expect(page.getByTestId("tool-select")).toHaveAttribute("aria-pressed", "true");

    await page.getByTestId("add-frame").click();
    await dragCanvas(page, { x: 12, y: 14 }, { x: 32, y: 26 });
    await expect(objectItems).toHaveCount(initialCount + 4);
    await expect(page.getByTestId("prop-rect-x")).toHaveValue(/12/);
    await expect(page.getByTestId("prop-rect-y")).toHaveValue(/14/);
    await expect(page.getByTestId("tool-select")).toHaveAttribute("aria-pressed", "true");
  } finally {
    await request.put(`/api/projects/${testProject}/annotations/${annotationId}`, { data: before });
  }
});

test("annotation editor: status notifications do not resize the canvas viewport", async ({ page }) => {
  await page.goto(`/projects/${testProject}/annotations/${annotationId}`);
  await expect(page.getByTestId("annotation-editor")).toBeVisible();

  const viewport = page.getByTestId("canvas-viewport");
  const before = await viewport.boundingBox();
  if (!before) {
    throw new Error("canvas viewport has no bounding box");
  }
  await page.getByTestId("save-button").click();
  await expect(page.getByText("保存しました")).toBeVisible();
  const during = await viewport.boundingBox();
  if (!during) {
    throw new Error("canvas viewport has no bounding box after status");
  }
  expect(Math.abs(during.height - before.height)).toBeLessThan(1);
});

test("annotation editor: selected point objects show a dashed selection frame", async ({ page }) => {
  await page.goto(`/projects/${testProject}/annotations/${annotationId}`);
  await expect(page.getByTestId("annotation-editor")).toBeVisible();

  const expectDashedSelectionFrame = async (
    locator: ReturnType<typeof page.locator>,
    borderRadius = "0px",
  ) => {
    await expect(locator).toHaveClass(/is-selected/);
    await expect.poll(() =>
      locator.evaluate((element) => {
        const style = getComputedStyle(element, "::before");
        return {
          borderStyle: style.borderStyle,
          borderWidth: style.borderWidth,
          borderRadius: style.borderRadius,
          content: style.content,
        };
      }),
    ).toEqual({
      borderStyle: "dashed",
      borderWidth: "2px",
      borderRadius,
      content: '""',
    });
  };
  const clickObject = async (locator: ReturnType<typeof page.locator>) => {
    const box = await locator.boundingBox();
    if (!box) {
      throw new Error("object has no bounding box");
    }
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  };

  const badge = page.locator('.mm-editor-figure [data-mm-id="b1"]');
  await clickObject(badge);
  await expectDashedSelectionFrame(badge, "50%");

  await page.getByTestId("add-text").click();
  await clickCanvas(page, 42, 32);
  const text = page.locator(".mm-editor-figure .mm-text").last();
  await clickObject(badge);
  await clickObject(text);
  await expectDashedSelectionFrame(text);

  await page.getByTestId("add-cursor").click();
  await clickCanvas(page, 54, 38);
  const cursor = page.locator(".mm-editor-figure .mm-cursor").last();
  await clickObject(badge);
  await clickObject(cursor);
  await expectDashedSelectionFrame(cursor);
});

test("annotation editor: visibility controls use accessible stroke icons", async ({ page }) => {
  await page.goto(`/projects/${testProject}/annotations/${annotationId}`);
  await expect(page.getByTestId("annotation-editor")).toBeVisible();

  const visibility = page.getByTestId("object-visibility-img-main");
  const solo = page.getByTestId("object-solo-img-main");
  await expect(visibility).toHaveAttribute("aria-label", "img-mainを一時的に非表示");
  await expect(visibility.locator("svg")).toHaveCount(1);
  await expect(solo).toHaveAttribute("aria-label", "img-mainだけを表示");
  await expect(solo.locator("svg")).toHaveCount(1);

  await visibility.click();
  await expect(visibility).toHaveAttribute("aria-label", "img-mainを表示");
  await expect(visibility).toHaveAttribute("aria-pressed", "true");
});

test("annotation editor: Alt-drag keeps the created copy selected", async ({ page, request }) => {
  const annotationPath = join(process.cwd(), "../../projects/example/annotations/1-1.json");
  const before = JSON.parse(readFileSync(annotationPath, "utf8"));
  await page.goto(`/projects/${testProject}/annotations/${annotationId}`);
  await expect(page.getByTestId("annotation-editor")).toBeVisible();

  try {
    const objectItems = page.locator('[data-testid^="object-item-"]');
    const initialCount = await objectItems.count();
    const badge = page.locator('.mm-editor-figure [data-mm-id="b1"]');
    const box = await badge.boundingBox();
    if (!box) {
      throw new Error("badge has no bounding box");
    }

    await page.keyboard.down("Alt");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2 + 30, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.up("Alt");

    await expect(objectItems).toHaveCount(initialCount + 1);
    await expect(page.locator('[data-testid^="object-item-"].border-blue-400')).toHaveCount(1);
  } finally {
    await request.put(`/api/projects/${testProject}/annotations/${annotationId}`, { data: before });
  }
});

test("annotation editor: line tools finish with Enter or double click and cancel with Escape", async ({ page, request }) => {
  const annotationPath = join(process.cwd(), "../../projects/example/annotations/1-1.json");
  const before = JSON.parse(readFileSync(annotationPath, "utf8")) as {
    objects: Array<{ id: string; type: string }>;
  };
  await page.goto(`/projects/${testProject}/annotations/${annotationId}`);
  await expect(page.getByTestId("annotation-editor")).toBeVisible();

  try {
    const lineCount = () => page.locator(".mm-editor-figure .mm-lines polyline").count();
    const initialLines = await lineCount();

    await page.getByTestId("add-line").click();
    await clickCanvas(page, 14, 18);
    const hover = await canvasPoint(page, 40, 30);
    await page.mouse.move(hover.x, hover.y);
    await expect(page.getByTestId("creation-preview")).toBeVisible();
    await page.mouse.click(hover.x, hover.y);
    await page.keyboard.press("Enter");
    await expect.poll(lineCount).toBe(initialLines + 1);
    await expect(page.getByTestId("tool-select")).toHaveAttribute("aria-pressed", "true");

    await page.getByTestId("add-arrow").click();
    await clickCanvas(page, 20, 22);
    const arrowEnd = await canvasPoint(page, 48, 38);
    await page.mouse.dblclick(arrowEnd.x, arrowEnd.y);
    await expect.poll(lineCount).toBe(initialLines + 2);
    await expect(page.getByTestId("tool-select")).toHaveAttribute("aria-pressed", "true");

    await page.getByTestId("add-line").click();
    await clickCanvas(page, 10, 10);
    await page.keyboard.press("Escape");
    await expect.poll(lineCount).toBe(initialLines + 2);
    await expect(page.getByTestId("tool-select")).toHaveAttribute("aria-pressed", "true");
  } finally {
    await request.put(`/api/projects/${testProject}/annotations/${annotationId}`, { data: before });
  }
});

test("annotation editor: zoom, fit, pointer zoom and space pan only change the viewport", async ({ page }) => {
  const annotationPath = join(process.cwd(), "../../projects/example/annotations/1-1.json");
  const beforeJson = readFileSync(annotationPath, "utf8");
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(`/projects/${testProject}/annotations/${annotationId}`);
  await expect(page.getByTestId("annotation-editor")).toBeVisible();

  const viewport = page.getByTestId("canvas-viewport");
  const zoomValue = page.getByTestId("zoom-value");
  await expect(viewport).toHaveAttribute("data-zoom-mode", "fit");
  const largeFit = await zoomValue.textContent();
  await page.setViewportSize({ width: 1000, height: 700 });
  await expect.poll(() => zoomValue.textContent()).not.toBe(largeFit);

  await page.keyboard.press("Control+1");
  await expect(zoomValue).toHaveText("100%");
  await page.getByTestId("zoom-in").click();
  await expect(zoomValue).toHaveText("125%");
  await page.getByTestId("zoom-out").click();
  await expect(zoomValue).toHaveText("100%");

  await page.keyboard.press("Control+0");
  await expect(viewport).toHaveAttribute("data-zoom-mode", "fit");
  const pointer = await canvasPoint(page, 35, 35);
  await page.mouse.move(pointer.x, pointer.y);
  await page.mouse.wheel(0, -120);
  const pointAfter = await canvasPoint(page, 35, 35);
  expect(Math.abs(pointAfter.x - pointer.x)).toBeLessThan(4);
  expect(Math.abs(pointAfter.y - pointer.y)).toBeLessThan(4);

  await page.keyboard.press("Control+1");
  const viewportBox = await viewport.boundingBox();
  if (!viewportBox) {
    throw new Error("canvas viewport has no bounding box");
  }
  const beforePan = await viewport.evaluate((element) => ({ x: element.scrollLeft, y: element.scrollTop }));
  await page.keyboard.down("Space");
  await page.mouse.move(viewportBox.x + viewportBox.width / 2, viewportBox.y + viewportBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(viewportBox.x + viewportBox.width / 2 - 100, viewportBox.y + viewportBox.height / 2 - 70, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  const afterPan = await viewport.evaluate((element) => ({ x: element.scrollLeft, y: element.scrollTop }));
  expect(afterPan.x).toBeGreaterThan(beforePan.x);
  expect(afterPan.y).toBeGreaterThan(beforePan.y);
  expect(readFileSync(annotationPath, "utf8")).toBe(beforeJson);
});

test("annotation editor: fit zoom above 100% preserves the canvas aspect ratio", async ({ page }) => {
  await page.setViewportSize({ width: 2000, height: 1400 });
  await page.goto(`/projects/${testProject}/annotations/1-2`);
  await expect(page.getByTestId("annotation-editor")).toBeVisible();

  const zoom = Number.parseFloat((await page.getByTestId("zoom-value").textContent()) ?? "0");
  expect(zoom).toBeGreaterThan(100);

  const figureSize = await page.locator(".mm-editor-figure figure").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  expect(figureSize.width / figureSize.height).toBeCloseTo(1286 / 771, 3);
});

test("annotation editor: add, drag and lock a second image", async ({ page, request }) => {
  const annotationPath = join(process.cwd(), "../../projects/example/annotations/1-1.json");
  const imagePath = join(process.cwd(), "../../projects/example/img/raw/1-1-img2.png");
  const before = JSON.parse(readFileSync(annotationPath, "utf8")) as {
    objects: Array<{ id: string; rect?: { x: number; y: number; w: number; h: number } }>;
  };
  await page.goto(`/projects/${testProject}/annotations/${annotationId}`);
  await expect(page.getByTestId("annotation-editor")).toBeVisible();

  try {
    rmSync(imagePath, { force: true });
    const [addResponse] = await Promise.all([
      page.waitForResponse(
        (response) => response.url().endsWith(`/annotations/${annotationId}/images`) && response.request().method() === "POST",
      ),
      page.getByTestId("add-image").click(),
      page.getByTestId("add-image-input").setInputFiles(
        join(process.cwd(), "../../projects/example/img/raw/1-1.png"),
      ),
    ]);
    expect(addResponse.status()).toBe(201);

    const imageItem = page.getByTestId("object-item-img2");
    await expect(imageItem).toBeVisible();
    const image = page.locator('[data-mm-id="img2"]');
    await expect(image).toBeVisible();
    const xInput = page.getByTestId("prop-rect-x");
    const beforeDrag = Number(await xInput.inputValue());
    await image.dragTo(page.locator(".mm-editor-figure figure"), {
      targetPosition: { x: 100, y: 100 },
    });
    await expect.poll(async () => Number(await xInput.inputValue())).not.toBe(beforeDrag);

    await page.getByTestId("object-lock-img2").click();
    await expect(page.getByText("このオブジェクトはロックされています")).toBeVisible();
    const rectLeft = (element: HTMLElement) => Number.parseFloat(element.style.left);
    const lockedX = await image.evaluate(rectLeft);
    await image.dragTo(page.locator(".mm-editor-figure figure"), {
      targetPosition: { x: 200, y: 120 },
    });
    expect(await image.evaluate(rectLeft)).toBe(lockedX);
    await page.keyboard.press("Delete");
    await expect(imageItem).toBeVisible();

    const [saveResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes(`/annotations/${annotationId}`) && response.request().method() === "PUT",
      ),
      page.getByTestId("save-button").click(),
    ]);
    expect(saveResponse.ok()).toBeTruthy();
    await expect.poll(() => {
      const saved = JSON.parse(readFileSync(annotationPath, "utf8")) as {
        objects: Array<{ id: string; locked?: boolean }>;
      };
      return saved.objects.find((obj) => obj.id === "img2")?.locked;
    }).toBe(true);
  } finally {
    await request.put(`/api/projects/${testProject}/annotations/${annotationId}`, { data: before });
    rmSync(imagePath, { force: true });
  }
});

test("annotation editor: add and configure a mosaic", async ({ page, request }) => {
  const annotationPath = join(process.cwd(), "../../projects/example/annotations/1-1.json");
  const before = JSON.parse(readFileSync(annotationPath, "utf8")) as {
    objects: Array<{ id: string; type: string }>;
  };
  await page.goto(`/projects/${testProject}/annotations/${annotationId}`);
  await expect(page.getByTestId("annotation-editor")).toBeVisible();

  try {
    const mosaicCountBefore = before.objects.filter((obj) => obj.type === "mosaic").length;
    await page.getByTestId("add-mosaic").click();
    await dragCanvas(page, { x: 20, y: 70 }, { x: 45, y: 85 });
    const mosaicItems = page.locator('[data-testid^="object-item-m"]');
    await expect(mosaicItems).toHaveCount(mosaicCountBefore + 1);
    const mosaicItem = mosaicItems.last();
    const mosaicId = (await mosaicItem.getAttribute("data-testid"))!.replace("object-item-", "");
    const mosaic = page.locator(`[data-mm-id="${mosaicId}"]`);
    await expect(mosaicItem).toBeVisible();
    await expect(mosaic).toBeVisible();
    await expect(page.getByTestId("mosaic-target")).toHaveValue("img-main");

    const xInput = page.getByTestId("prop-rect-x");
    const beforeDrag = Number(await xInput.inputValue());
    await mosaic.dragTo(page.locator(".mm-editor-figure figure"), {
      targetPosition: { x: 180, y: 120 },
    });
    await expect.poll(async () => Number(await xInput.inputValue())).not.toBe(beforeDrag);
    await page.getByTestId("mosaic-block-size").fill("16");
    await page.getByTestId("mosaic-block-size").blur();

    await page.getByTestId("save-button").click();
    await expect.poll(() => {
      const saved = JSON.parse(readFileSync(annotationPath, "utf8")) as {
        objects: Array<{ id: string; targetImageId?: string; blockSize?: number }>;
      };
      return saved.objects.find((obj) => obj.id === mosaicId);
    }).toMatchObject({ targetImageId: "img-main", blockSize: 16 });
  } finally {
    await request.put(`/api/projects/${testProject}/annotations/${annotationId}`, { data: before });
  }
});

test("annotation editor: back returns to the project page", async ({ page }) => {
  await page.goto(`/projects/${testProject}/annotations/${annotationId}`);
  await expect(page.getByTestId("annotation-editor")).toBeVisible();

  await page.getByTestId("back-to-project").click();
  await expect(page.getByRole("link", { name: "マニュアル編集" })).toBeVisible();
  await expect(page.getByRole("heading", { name: testProject })).toBeVisible();
});

test("annotation editor: frame can be selected from object list and resized via handles", async ({
  page,
  request,
}) => {
  const annotationPath = join(process.cwd(), "../../projects/example/annotations/1-1.json");
  const before = JSON.parse(readFileSync(annotationPath, "utf8")) as {
    objects: Array<{ id: string; rect?: { x: number; y: number; w: number; h: number } }>;
  };
  await page.goto(`/projects/${testProject}/annotations/${annotationId}`);
  await expect(page.getByTestId("annotation-editor")).toBeVisible();

  try {
    // オブジェクト一覧(ツリー)から背面の frame を選択できる
    await page.getByTestId("object-item-f-menu").click();
    const handle = page.getByTestId("frame-handle-se");
    await expect(handle).toBeVisible();
    await handle.scrollIntoViewIfNeeded();

    const box = await handle.boundingBox();
    if (!box) {
      throw new Error("resize handle has no bounding box");
    }
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 40, cy + 25, { steps: 4 });
    await page.mouse.up();

    const [saveResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes(`/annotations/${annotationId}`) && response.request().method() === "PUT",
      ),
      page.getByTestId("save-button").click(),
    ]);
    expect(saveResponse.ok()).toBeTruthy();

    const after = JSON.parse(readFileSync(annotationPath, "utf8")) as typeof before;
    const beforeRect = before.objects.find((obj) => obj.id === "f-menu")?.rect;
    const afterRect = after.objects.find((obj) => obj.id === "f-menu")?.rect;
    expect(beforeRect && afterRect).toBeTruthy();
    expect(afterRect!.w).toBeGreaterThan(beforeRect!.w);
    expect(afterRect!.h).toBeGreaterThan(beforeRect!.h);
  } finally {
    await request.put(`/api/projects/${testProject}/annotations/${annotationId}`, { data: before });
  }
});

test("annotation editor: selected badge can be dragged through a covering frame", async ({ page }) => {
  await page.goto(`/projects/${testProject}/annotations/${annotationId}`);
  await expect(page.getByTestId("annotation-editor")).toBeVisible();

  const badge = page.locator('[data-mm-id="b1"]');
  const frame = page.locator('[data-mm-id="f-menu"]');
  await page.getByTestId("object-item-b1").click();
  await expect(badge).toHaveClass(/is-selected/);

  const badgeLeftBefore = await badge.evaluate((element) => Number.parseFloat(element.style.left));
  const frameLeftBefore = await frame.evaluate((element) => Number.parseFloat(element.style.left));
  await dragCanvas(page, { x: 8.5, y: 22 }, { x: 11.5, y: 24 });

  await expect.poll(() => badge.evaluate((element) => Number.parseFloat(element.style.left)))
    .toBeGreaterThan(badgeLeftBefore);
  await expect.poll(() => frame.evaluate((element) => Number.parseFloat(element.style.left)))
    .toBe(frameLeftBefore);
});

test("annotation editor: objects follow the pointer while dragging and resizing", async ({ page }) => {
  await page.goto(`/projects/${testProject}/annotations/${annotationId}`);
  await expect(page.getByTestId("annotation-editor")).toBeVisible();

  const frame = page.locator('[data-mm-id="f-menu"]');
  const frameBox = await frame.boundingBox();
  if (!frameBox) {
    throw new Error("frame has no bounding box");
  }
  const frameLeftBefore = await frame.evaluate((element) => Number.parseFloat(element.style.left));
  await page.mouse.move(frameBox.x + frameBox.width / 2, frameBox.y + frameBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(frameBox.x + frameBox.width / 2 + 30, frameBox.y + frameBox.height / 2 + 20);
  await expect.poll(() => frame.evaluate((element) => Number.parseFloat(element.style.left)))
    .toBeGreaterThan(frameLeftBefore);
  await page.mouse.up();

  await page.getByTestId("object-item-f-menu").click();
  const handle = page.getByTestId("frame-handle-se");
  const handleBox = await handle.boundingBox();
  if (!handleBox) {
    throw new Error("resize handle has no bounding box");
  }
  const frameWidthBefore = await frame.evaluate((element) => Number.parseFloat(element.style.width));
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 30, handleBox.y + handleBox.height / 2 + 20);
  await expect.poll(() => frame.evaluate((element) => Number.parseFloat(element.style.width)))
    .toBeGreaterThan(frameWidthBefore);
  await page.mouse.up();

  await page.reload();
  await expect(page.getByTestId("annotation-editor")).toBeVisible();
  const badge = page.locator('[data-mm-id="b9"]');
  await expect(badge).toBeVisible();
  const badgeBox = await badge.boundingBox();
  if (!badgeBox) {
    throw new Error("badge has no bounding box");
  }
  const badgeLeftBefore = await badge.evaluate((element) => Number.parseFloat(element.style.left));
  await page.mouse.move(badgeBox.x + badgeBox.width / 2, badgeBox.y + badgeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(badgeBox.x + badgeBox.width / 2 + 30, badgeBox.y + badgeBox.height / 2 + 20);
  await expect.poll(() => badge.evaluate((element) => Number.parseFloat(element.style.left)))
    .toBeGreaterThan(badgeLeftBefore);
  await page.mouse.up();
});

test("annotation editor: every selected object follows a group drag", async ({ page }) => {
  await page.goto(`/projects/${testProject}/annotations/${annotationId}`);
  await expect(page.getByTestId("annotation-editor")).toBeVisible();

  await page.getByTestId("object-item-b9").click();
  await page.getByTestId("object-item-b10").click({ modifiers: ["ControlOrMeta"] });
  await expect(page.getByTestId("selection-count")).toHaveText("2個選択");

  const first = page.locator('[data-mm-id="b9"]');
  const second = page.locator('[data-mm-id="b10"]');
  const firstLeftBefore = await first.evaluate((element) => Number.parseFloat(element.style.left));
  const secondLeftBefore = await second.evaluate((element) => Number.parseFloat(element.style.left));
  const secondBox = await second.boundingBox();
  if (!secondBox) {
    throw new Error("badge has no bounding box");
  }

  await page.mouse.move(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(secondBox.x + secondBox.width / 2 + 30, secondBox.y + secondBox.height / 2 + 20);
  await expect.poll(() => first.evaluate((element) => Number.parseFloat(element.style.left)))
    .toBeGreaterThan(firstLeftBefore);
  await expect.poll(() => second.evaluate((element) => Number.parseFloat(element.style.left)))
    .toBeGreaterThan(secondLeftBefore);
  await page.mouse.up();
});

test("annotation editor: arrow points can be edited by dragging point handles", async ({
  page,
  request,
}) => {
  const annotationPath = join(process.cwd(), "../../projects/example/annotations/1-1.json");
  const before = JSON.parse(readFileSync(annotationPath, "utf8")) as {
    objects: Array<{ id: string; points?: Array<{ x: number; y: number }> }>;
  };
  await page.goto(`/projects/${testProject}/annotations/${annotationId}`);
  await expect(page.getByTestId("annotation-editor")).toBeVisible();

  try {
    await page.getByTestId("object-item-a1").click();
    const handle = page.getByTestId("point-handle-0");
    await expect(handle).toBeVisible();
    const originalPoints = await page
      .locator('.mm-editor-figure .mm-lines polyline[data-mm-id="a1"]')
      .getAttribute("points");
    expect(originalPoints).toBeTruthy();
    await page.locator(".mm-editor-figure").evaluate((root) => {
      const read = () =>
        root.querySelector('.mm-lines polyline[data-mm-id="a1"]')?.getAttribute("points") ?? "";
      const history = [read()];
      const observer = new MutationObserver(() => {
        const value = read();
        if (history.at(-1) !== value) {
          history.push(value);
        }
      });
      observer.observe(root, { attributes: true, childList: true, subtree: true });
      Object.assign(window, { __arrowPointsHistory: history, __arrowPointsObserver: observer });
    });
    // 点はキャンバス下部(y=92%)にあり viewport 外のため、生 mouse API の前にスクロールする
    await handle.scrollIntoViewIfNeeded();

    const box = await handle.boundingBox();
    if (!box) {
      throw new Error("point handle has no bounding box");
    }
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 30, cy - 20, { steps: 4 });
    await page.mouse.up();
    const pointsHistory = await page.evaluate(() => {
      const state = window as typeof window & {
        __arrowPointsHistory?: string[];
        __arrowPointsObserver?: MutationObserver;
      };
      state.__arrowPointsObserver?.disconnect();
      return state.__arrowPointsHistory ?? [];
    });
    const firstChanged = pointsHistory.findIndex((value) => value !== originalPoints);
    expect(firstChanged).toBeGreaterThan(0);
    // ドラッグが始まった後に元の点列へ戻ると、元位置と現在位置の線が交互に描画される
    expect(pointsHistory.slice(firstChanged)).not.toContain(originalPoints);

    const [saveResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes(`/annotations/${annotationId}`) && response.request().method() === "PUT",
      ),
      page.getByTestId("save-button").click(),
    ]);
    expect(saveResponse.ok()).toBeTruthy();

    const after = JSON.parse(readFileSync(annotationPath, "utf8")) as typeof before;
    const beforePoints = before.objects.find((obj) => obj.id === "a1")?.points;
    const afterPoints = after.objects.find((obj) => obj.id === "a1")?.points;
    expect(beforePoints && afterPoints).toBeTruthy();
    expect(afterPoints!.length).toBe(beforePoints!.length);
    expect(Math.abs(afterPoints![0]!.x - beforePoints![0]!.x)).toBeGreaterThan(0.5);
    // 他の点は動かない
    expect(afterPoints![1]).toEqual(beforePoints![1]);
  } finally {
    await request.put(`/api/projects/${testProject}/annotations/${annotationId}`, { data: before });
  }
});

test("annotation editor: selected line point is highlighted on canvas and side panel", async ({
  page,
}) => {
  await page.goto(`/projects/${testProject}/annotations/${annotationId}`);
  await expect(page.getByTestId("annotation-editor")).toBeVisible();
  await page.getByTestId("object-item-a1").click();

  await page.getByTestId("point-handle-1").click();
  await expect(page.getByTestId("point-handle-1")).toHaveClass(/is-active/);
  await expect(page.getByTestId("point-row-1")).toHaveClass(/bg-blue-100/);

  await page.getByTestId("prop-point-0-x").click();
  await expect(page.getByTestId("point-handle-0")).toHaveClass(/is-active/);
  await expect(page.getByTestId("point-row-0")).toHaveClass(/bg-blue-100/);
  await expect(page.getByTestId("point-row-1")).not.toHaveClass(/bg-blue-100/);
});

test("annotation editor: line and arrow types can be switched without changing points", async ({
  page,
}) => {
  await page.goto(`/projects/${testProject}/annotations/${annotationId}`);
  await expect(page.getByTestId("annotation-editor")).toBeVisible();
  await page.getByTestId("object-item-a1").click();
  const polyline = page.locator('.mm-editor-figure polyline[data-mm-id="a1"]');
  const originalPoints = await polyline.getAttribute("points");

  await page.getByTestId("line-type").selectOption("line");
  await expect(polyline).not.toHaveAttribute("marker-end");
  await expect(page.getByTestId("object-item-a1")).toContainText("line");
  await expect(polyline).toHaveAttribute("points", originalPoints!);

  await page.getByTestId("line-type").selectOption("arrow");
  await expect(polyline).toHaveAttribute("marker-end", /mm-arrow-a1/);
  await expect(page.getByTestId("object-item-a1")).toContainText("arrow");
  await expect(polyline).toHaveAttribute("points", originalPoints!);
});

test("annotation editor: arrow heads can be set to start, end, or both", async ({ page }) => {
  await page.goto(`/projects/${testProject}/annotations/${annotationId}`);
  await expect(page.getByTestId("annotation-editor")).toBeVisible();
  await page.getByTestId("object-item-a1").click();
  const polyline = page.locator('.mm-editor-figure polyline[data-mm-id="a1"]');

  await page.getByTestId("arrow-heads").selectOption("start");
  await expect(polyline).toHaveAttribute("marker-start", /mm-arrow-a1-start/);
  await expect(polyline).not.toHaveAttribute("marker-end");

  await page.getByTestId("arrow-heads").selectOption("both");
  await expect(polyline).toHaveAttribute("marker-start", /mm-arrow-a1-start/);
  await expect(polyline).toHaveAttribute("marker-end", /mm-arrow-a1/);

  await page.getByTestId("arrow-heads").selectOption("end");
  await expect(polyline).toHaveAttribute("marker-end", /mm-arrow-a1/);
  await expect(polyline).not.toHaveAttribute("marker-start");
});

test("annotation editor: line can be selected by clicking near the stroke", async ({ page }) => {
  await page.goto(`/projects/${testProject}/annotations/${annotationId}`);
  await expect(page.getByTestId("annotation-editor")).toBeVisible();
  await expect(page.locator(".mm-editor-figure figure")).toBeVisible();

  // a1 の縦セグメント(x=62.3%)から 6px 右にずらした位置をクリック。
  // 実線(2px)の外だがヒット領域(18px)の内側なら選択できるはず
  const figure = page.locator(".mm-editor-figure figure");
  const box = await figure.boundingBox();
  if (!box) {
    throw new Error("figure has no bounding box");
  }
  await page.mouse.click(box.x + box.width * 0.623 + 6, box.y + box.height * 0.5);

  await expect(page.getByTestId("object-item-a1")).toHaveClass(/border-blue-400/);
});

test("annotation editor: cursor can be added, configured and saved as inline SVG", async ({
  page,
  request,
}) => {
  const annotationPath = join(process.cwd(), "../../projects/example/annotations/1-1.json");
  const before = JSON.parse(readFileSync(annotationPath, "utf8")) as {
    objects: Array<{ id: string; type: string; icon?: string; size?: number }>;
  };
  await page.goto(`/projects/${testProject}/annotations/${annotationId}`);
  await expect(page.getByTestId("annotation-editor")).toBeVisible();

  try {
    await page.getByTestId("add-cursor").click();
    await clickCanvas(page, 50, 50);
    await expect(page.locator(".mm-editor-figure .mm-cursor svg")).toBeVisible();
    await page.getByTestId("cursor-icon").selectOption("move");
    await page.getByTestId("cursor-size").fill("36");

    const [saveResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes(`/annotations/${annotationId}`) &&
          response.request().method() === "PUT",
      ),
      page.getByTestId("save-button").click(),
    ]);
    expect(saveResponse.ok()).toBeTruthy();

    const after = JSON.parse(readFileSync(annotationPath, "utf8")) as typeof before;
    const cursor = after.objects.find((obj) => obj.type === "cursor");
    expect(cursor).toMatchObject({ icon: "move", size: 36 });
    await expect(page.locator(".mm-editor-figure .mm-cursor svg")).toHaveCount(1);
  } finally {
    await request.put(`/api/projects/${testProject}/annotations/${annotationId}`, { data: before });
  }
});

test("annotation editor: tool palette shows tool-name tooltips", async ({ page }) => {
  await page.goto(`/projects/${testProject}/annotations/${annotationId}`);
  await expect(page.getByTestId("annotation-editor")).toBeVisible();

  // ツール名 = SPEC の注釈用語。aria-label と CSS ツールチップ(data-tip)を持つ
  const toolNames = ["丸数字", "テキスト", "カーソル", "強調枠", "罫線", "矢印"];
  for (const name of toolNames) {
    const button = page.getByRole("button", { name, exact: true });
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute("data-tip", name);
    // ネイティブ title は外す(CSS ツールチップと二重表示になるため)
    await expect(button).not.toHaveAttribute("title");
  }

  // ホバーで ::after のツールチップが表示される(遅延後に不透明化)
  const badgeTool = page.getByRole("button", { name: "丸数字", exact: true });
  const tipOpacity = () =>
    badgeTool.evaluate((el) => getComputedStyle(el, "::after").opacity);
  expect(await tipOpacity()).toBe("0");
  await badgeTool.hover();
  await expect.poll(tipOpacity, { timeout: 2000 }).toBe("1");
});
