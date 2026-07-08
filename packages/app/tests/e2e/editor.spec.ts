import { expect, test } from "@playwright/test";
import { existsSync, readFileSync, rmSync } from "node:fs";
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
