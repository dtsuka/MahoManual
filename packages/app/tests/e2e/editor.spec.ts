import { expect, test } from "@playwright/test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

test("annotation editor: add, drag and lock a second image", async ({ page, request }) => {
  const annotationPath = join(process.cwd(), "../../projects/example/annotations/1-1.json");
  const imagePath = join(process.cwd(), "../../projects/example/img/raw/1-1-img2.png");
  const before = JSON.parse(readFileSync(annotationPath, "utf8")) as {
    objects: Array<{ id: string; rect?: { x: number; y: number; w: number; h: number } }>;
  };
  await page.goto(`/projects/${testProject}/annotations/${annotationId}`);
  await expect(page.getByTestId("annotation-editor")).toBeVisible();

  try {
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
    const lockedX = Number(await xInput.inputValue());
    await image.dragTo(page.locator(".mm-editor-figure figure"), {
      targetPosition: { x: 200, y: 120 },
    });
    expect(Number(await xInput.inputValue())).toBe(lockedX);
    await page.keyboard.press("Delete");
    await expect(imageItem).toBeVisible();

    await page.getByTestId("save-button").click();
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
    await page.getByTestId("add-mosaic").click();
    const mosaicItem = page.getByTestId("object-item-m1");
    const mosaic = page.locator('[data-mm-id="m1"]');
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
      return saved.objects.find((obj) => obj.id === "m1");
    }).toMatchObject({ targetImageId: "img-main", blockSize: 16 });
  } finally {
    await request.put(`/api/projects/${testProject}/annotations/${annotationId}`, { data: before });
  }
});

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

test("annotation editor: side panel numeric inputs update position", async ({ page, request }) => {
  const annotationPath = join(process.cwd(), "../../projects/example/annotations/1-1.json");
  const before = JSON.parse(readFileSync(annotationPath, "utf8")) as {
    objects: Array<{ id: string; at?: { x: number; y: number } }>;
  };
  await page.goto(`/projects/${testProject}/annotations/${annotationId}`);
  await expect(page.getByTestId("annotation-editor")).toBeVisible();

  try {
    await page.getByTestId("object-item-b1").click();
    await page.getByTestId("prop-at-x").fill("60");

    // figure DOM に即時反映される(WYSIWYG)
    await expect(page.locator('.mm-editor-figure [data-mm-id="b1"]')).toHaveAttribute("style", /left:60%/);

    const [saveResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes(`/annotations/${annotationId}`) && response.request().method() === "PUT",
      ),
      page.getByTestId("save-button").click(),
    ]);
    expect(saveResponse.ok()).toBeTruthy();

    const after = JSON.parse(readFileSync(annotationPath, "utf8")) as typeof before;
    expect(after.objects.find((obj) => obj.id === "b1")?.at?.x).toBe(60);
  } finally {
    await request.put(`/api/projects/${testProject}/annotations/${annotationId}`, { data: before });
  }
});

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

test("annotation editor: object list can be reordered by drag and drop", async ({ page, request }) => {
  const annotationPath = join(process.cwd(), "../../projects/example/annotations/1-1.json");
  const before = JSON.parse(readFileSync(annotationPath, "utf8")) as {
    objects: Array<{ id: string }>;
  };
  const indexOf = (objects: Array<{ id: string }>, id: string) =>
    objects.findIndex((obj) => obj.id === id);
  // 前提: b1 は b2 より背面(配列で前)にある
  expect(indexOf(before.objects, "b1")).toBeLessThan(indexOf(before.objects, "b2"));

  await page.goto(`/projects/${testProject}/annotations/${annotationId}`);
  await expect(page.getByTestId("annotation-editor")).toBeVisible();

  try {
    // 表示リスト(前面→背面)で b1 を b2 の位置(より前面)へドラッグ
    await page.dragAndDrop('[data-testid="object-item-b1"]', '[data-testid="object-item-b2"]');

    const [saveResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes(`/annotations/${annotationId}`) && response.request().method() === "PUT",
      ),
      page.getByTestId("save-button").click(),
    ]);
    expect(saveResponse.ok()).toBeTruthy();

    const after = JSON.parse(readFileSync(annotationPath, "utf8")) as typeof before;
    // 配列順 = 描画順が入れ替わっている(b1 が b2 より前面=配列で後ろ)
    expect(indexOf(after.objects, "b1")).toBeGreaterThan(indexOf(after.objects, "b2"));
  } finally {
    await request.put(`/api/projects/${testProject}/annotations/${annotationId}`, { data: before });
  }
});

test("annotation editor: badge color and font size can be edited from the side panel", async ({
  page,
  request,
}) => {
  const annotationPath = join(process.cwd(), "../../projects/example/annotations/1-1.json");
  const before = JSON.parse(readFileSync(annotationPath, "utf8")) as {
    objects: Array<{ id: string; color?: string; fontSize?: number }>;
  };
  await page.goto(`/projects/${testProject}/annotations/${annotationId}`);
  await expect(page.getByTestId("annotation-editor")).toBeVisible();

  try {
    await page.getByTestId("object-item-b1").click();
    await page.getByTestId("prop-color").fill("#336699");
    await page.getByTestId("prop-font-size").fill("18");

    // figure に即時反映される
    await expect(page.locator('.mm-editor-figure [data-mm-id="b1"]')).toHaveAttribute(
      "style",
      /background:#336699/,
    );

    const [saveResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes(`/annotations/${annotationId}`) && response.request().method() === "PUT",
      ),
      page.getByTestId("save-button").click(),
    ]);
    expect(saveResponse.ok()).toBeTruthy();

    const after = JSON.parse(readFileSync(annotationPath, "utf8")) as typeof before;
    const badge = after.objects.find((obj) => obj.id === "b1");
    expect(badge?.color).toBe("#336699");
    expect(badge?.fontSize).toBe(18);
  } finally {
    await request.put(`/api/projects/${testProject}/annotations/${annotationId}`, { data: before });
  }
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

test("annotation editor: keyboard move, copy/paste, multi-select and crop editing", async ({
  page,
  request,
}) => {
  const annotationPath = join(process.cwd(), "../../projects/example/annotations/1-1.json");
  const before = JSON.parse(readFileSync(annotationPath, "utf8")) as {
    objects: Array<{
      id: string;
      type: string;
      at?: { x: number; y: number };
      crop?: { x: number; y: number; w: number; h: number };
    }>;
  };
  await page.goto(`/projects/${testProject}/annotations/${annotationId}`);
  await expect(page.getByTestId("annotation-editor")).toBeVisible();

  try {
    await page.getByTestId("object-item-b1").click();
    await page.getByTestId("object-item-b2").click({ modifiers: ["Meta"] });
    await expect(page.getByTestId("selection-count")).toHaveText("2個選択");

    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Shift+ArrowDown");
    await page.keyboard.press("Meta+c");
    await page.keyboard.press("Meta+v");
    await expect(page.getByTestId("selection-count")).toHaveText("2個選択");

    await page.getByTestId("object-item-img-main").click();
    await page.getByTestId("object-lock-img-main").click();
    await page.getByTestId("crop-x").fill("10");
    await page.getByTestId("crop-y").fill("20");
    await page.getByTestId("crop-w").fill("800");
    await page.getByTestId("crop-h").fill("600");

    const [saveResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes(`/annotations/${annotationId}`) && response.request().method() === "PUT",
      ),
      page.getByTestId("save-button").click(),
    ]);
    expect(saveResponse.ok()).toBeTruthy();

    const after = JSON.parse(readFileSync(annotationPath, "utf8")) as typeof before;
    expect(after.objects).toHaveLength(before.objects.length + 2);
    expect(after.objects.find((obj) => obj.id === "b1")?.at).toEqual({ x: 8.6, y: 23 });
    expect(after.objects.find((obj) => obj.id === "b2")?.at).toEqual({ x: 8.6, y: 27.5 });
    expect(after.objects.find((obj) => obj.id === "img-main")?.crop).toEqual({
      x: 10,
      y: 20,
      w: 800,
      h: 600,
    });
  } finally {
    await request.put(`/api/projects/${testProject}/annotations/${annotationId}`, { data: before });
  }
});

test("annotation editor: selected image can be replaced without losing annotations", async ({
  page,
}) => {
  const projectRoot = join(process.cwd(), "../../projects/example");
  const annotationPath = join(projectRoot, "annotations/1-1.json");
  const imagePath = join(projectRoot, "img/raw/1-1.png");
  const beforeAnnotation = readFileSync(annotationPath);
  const beforeImage = readFileSync(imagePath);
  const replacementPath = join(process.cwd(), "test-results/replacement.png");
  const replacement =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  writeFileSync(replacementPath, Buffer.from(replacement, "base64"));

  await page.goto(`/projects/${testProject}/annotations/${annotationId}`);
  await expect(page.getByTestId("annotation-editor")).toBeVisible();

  try {
    const objectCount = await page.locator('[data-testid^="object-item-"]').count();
    await page.getByTestId("object-item-img-main").click();
    await page.getByTestId("object-lock-img-main").click();
    await page.getByTestId("replace-image-button").click();
    await page.getByTestId("replace-image-input").setInputFiles(replacementPath);

    await expect(page.getByText("画像を置換しました")).toBeVisible();
    await expect(page.locator('[data-testid^="object-item-"]')).toHaveCount(objectCount);
    await expect(page.getByTestId("crop-w")).toHaveValue("1");
    await expect(page.getByTestId("crop-h")).toHaveValue("1");
  } finally {
    writeFileSync(annotationPath, beforeAnnotation);
    writeFileSync(imagePath, beforeImage);
    rmSync(replacementPath, { force: true });
  }
});

test("annotation editor: image id can be renamed and navigates to the new URL", async ({
  page,
  request,
}) => {
  const id = `e2e-rename-${Date.now()}`;
  const renamedId = `${id}-done`;
  const png =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const create = await request.post(`/api/projects/${testProject}/images`, {
    data: { id, data: `data:image/png;base64,${png}`, width: 1, height: 1 },
  });
  expect(create.ok()).toBeTruthy();

  await page.goto(`/projects/${testProject}/annotations/${id}`);
  await expect(page.getByTestId("annotation-editor")).toBeVisible();

  try {
    await page.getByTestId("rename-id-input").fill(renamedId);
    await page.getByTestId("rename-id-button").click();
    await expect(page).toHaveURL(`/projects/${testProject}/annotations/${renamedId}`);
    await expect(page.getByRole("heading", { name: `${testProject} / ${renamedId}` })).toBeVisible();
  } finally {
    const projectRoot = join(process.cwd(), "../../projects/example");
    for (const candidate of [id, renamedId]) {
      rmSync(join(projectRoot, `annotations/${candidate}.json`), { force: true });
      rmSync(join(projectRoot, `img/raw/${candidate}.png`), { force: true });
      rmSync(join(projectRoot, `img/${candidate}.png`), { force: true });
    }
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

test("annotation editor: composed annotation image can be downloaded", async ({ page }) => {
  await page.goto(`/projects/${testProject}/annotations/${annotationId}`);
  await expect(page.getByTestId("annotation-editor")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("download-composed-image").click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe(`${annotationId}.png`);
});

test("annotation editor: undo and redo restore edits and dirty state", async ({ page }) => {
  await page.goto(`/projects/${testProject}/annotations/${annotationId}`);
  await expect(page.getByTestId("annotation-editor")).toBeVisible();
  const objectItems = page.locator('[data-testid^="object-item-"]');
  const initialCount = await objectItems.count();

  await expect(page.getByTestId("undo-button")).toBeDisabled();
  await expect(page.getByTestId("redo-button")).toBeDisabled();

  await page.getByTestId("add-badge").click();
  await expect(objectItems).toHaveCount(initialCount + 1);
  await expect(page.getByText("未保存")).toBeVisible();

  await page.getByTestId("undo-button").click();
  await expect(objectItems).toHaveCount(initialCount);
  await expect(page.getByText("未保存")).toHaveCount(0);
  await expect(page.getByTestId("redo-button")).toBeEnabled();

  await page.getByTestId("redo-button").click();
  await expect(objectItems).toHaveCount(initialCount + 1);
  await expect(page.getByText("未保存")).toBeVisible();

  await page.keyboard.press("Meta+z");
  await expect(objectItems).toHaveCount(initialCount);
  await page.keyboard.press("Meta+Shift+z");
  await expect(objectItems).toHaveCount(initialCount + 1);
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
    await expect(page.getByRole("heading", { name: id })).toBeVisible();
    expect(existsSync(join(root, "manual.md"))).toBe(true);
    expect(readFileSync(join(root, "project.yaml"), "utf8")).toContain(title);
  } finally {
    rmSync(root, { recursive: true, force: true });
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

test("annotation editor: canvas margin expands canvas keeping object positions (SPEC §4.5)", async ({
  page,
}) => {
  const annotationPath = join(process.cwd(), "../../projects/example/annotations/1-1.json");
  const originalJson = readFileSync(annotationPath, "utf8");
  try {
    await page.goto(`/projects/${testProject}/annotations/${annotationId}`);
    await expect(page.getByTestId("annotation-editor")).toBeVisible();

    const before = JSON.parse(originalJson) as {
      canvas: { width: number; height: number };
      objects: Array<{ id: string; at?: { x: number; y: number } }>;
    };
    const beforeBadge = before.objects.find((obj) => obj.id === "b1");

    // 適用前: バッジ中心の画像(ラッパー)に対する相対位置を記録
    const badge = page.locator('.mm-editor-figure [data-mm-id="b1"]');
    const image = page.locator(".mm-editor-figure .mm-image").first();
    await expect(badge).toBeVisible();
    await expect(image).toBeVisible();
    const ratioOf = async () => {
      const badgeBox = await badge.boundingBox();
      const imageBox = await image.boundingBox();
      if (!badgeBox || !imageBox) {
        throw new Error("boundingBox unavailable");
      }
      return {
        x: (badgeBox.x + badgeBox.width / 2 - imageBox.x) / imageBox.width,
        y: (badgeBox.y + badgeBox.height / 2 - imageBox.y) / imageBox.height,
      };
    };
    const beforeRatio = await ratioOf();

    await page.getByTestId("canvas-margin-left").fill("100");
    await page.getByTestId("canvas-margin-top").fill("50");
    await page.getByTestId("canvas-margin-apply").click();

    // 画像に対するバッジの相対位置は変わらない(見た目の位置が維持される)
    const afterRatio = await ratioOf();
    expect(Math.abs(afterRatio.x - beforeRatio.x)).toBeLessThan(0.01);
    expect(Math.abs(afterRatio.y - beforeRatio.y)).toBeLessThan(0.01);

    // 保存でJSONのcanvasと%座標が更新される
    const [saveResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes(`/annotations/${annotationId}`) &&
          response.request().method() === "PUT",
      ),
      page.getByTestId("save-button").click(),
    ]);
    expect(saveResponse.ok()).toBeTruthy();

    const saved = JSON.parse(readFileSync(annotationPath, "utf8")) as typeof before;
    expect(saved.canvas.width).toBe(before.canvas.width + 100);
    expect(saved.canvas.height).toBe(before.canvas.height + 50);
    const savedBadge = saved.objects.find((obj) => obj.id === "b1");
    const expectedX =
      ((((beforeBadge?.at?.x ?? 0) / 100) * before.canvas.width + 100) /
        (before.canvas.width + 100)) *
      100;
    const expectedY =
      ((((beforeBadge?.at?.y ?? 0) / 100) * before.canvas.height + 50) /
        (before.canvas.height + 50)) *
      100;
    expect(savedBadge?.at?.x ?? 0).toBeCloseTo(expectedX, 6);
    expect(savedBadge?.at?.y ?? 0).toBeCloseTo(expectedY, 6);
  } finally {
    writeFileSync(annotationPath, originalJson, "utf8");
  }
});
