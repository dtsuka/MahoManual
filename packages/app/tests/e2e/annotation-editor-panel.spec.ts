import { expect, test } from "@playwright/test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { annotationId, clickCanvas, testProject } from "./helpers.js";

// example/1-1.json と project.yaml を複数テストが共有するため、並列実行での汚染を防ぐ
test.describe.configure({ mode: "serial" });

test("annotation editor: visual crop drag is reverted by one undo", async ({ page, request }) => {
  const annotationPath = join(process.cwd(), "../../projects/example/annotations/1-1.json");
  const before = JSON.parse(readFileSync(annotationPath, "utf8"));
  await page.goto(`/projects/${testProject}/annotations/${annotationId}`);
  await expect(page.getByTestId("annotation-editor")).toBeVisible();

  try {
    await page.getByTestId("object-lock-img-main").click();
    await page.getByTestId("object-item-img-main").click();
    const initialW = await page.getByTestId("crop-w").inputValue();
    const initialH = await page.getByTestId("crop-h").inputValue();

    await page.getByTestId("open-visual-crop").click();
    const handle = page.getByTestId("crop-handle-se");
    const box = await handle.boundingBox();
    if (!box) {
      throw new Error("crop handle has no bounding box");
    }
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x - 80, box.y - 60, { steps: 5 });
    await page.mouse.up();
    await page.getByTestId("crop-confirm").click();
    await expect(page.getByTestId("crop-w")).not.toHaveValue(initialW);

    await page.keyboard.press("Meta+z");
    await expect(page.getByTestId("crop-w")).toHaveValue(initialW);
    await expect(page.getByTestId("crop-h")).toHaveValue(initialH);
  } finally {
    await request.put(`/api/projects/${testProject}/annotations/${annotationId}`, { data: before });
  }
});

test("annotation editor: selected style can be saved and cleared as the project default", async ({ page }) => {
  const projectYamlPath = join(process.cwd(), "../../projects/example/project.yaml");
  const originalYaml = readFileSync(projectYamlPath, "utf8");
  await page.goto(`/projects/${testProject}/annotations/${annotationId}`);
  await expect(page.getByTestId("annotation-editor")).toBeVisible();

  try {
    await page.getByTestId("object-item-b1").click();
    await page.getByTestId("project-default-save").click();
    await expect(page.getByTestId("project-default-clear")).toBeVisible();
    await expect.poll(() => readFileSync(projectYamlPath, "utf8")).toContain("defaults:");
    expect(readFileSync(projectYamlPath, "utf8")).toContain("badge:");

    await page.getByTestId("project-default-clear").click();
    await expect(page.getByTestId("project-default-clear")).toHaveCount(0);
    await expect.poll(() => readFileSync(projectYamlPath, "utf8")).not.toContain("badge:");
  } finally {
    writeFileSync(projectYamlPath, originalYaml, "utf8");
  }
});

test("annotation editor: selected object style can be reset to defaults", async ({ page }) => {
  await page.goto(`/projects/${testProject}/annotations/${annotationId}`);
  await expect(page.getByTestId("annotation-editor")).toBeVisible();

  await page.getByTestId("object-item-b1").click();
  await page.getByTestId("prop-color").fill("#123456");
  await page.getByTestId("prop-font-size").fill("28");
  await expect(page.getByTestId("prop-color")).toHaveValue("#123456");
  await expect(page.getByTestId("prop-font-size")).toHaveValue("28");

  await page.getByRole("button", { name: "デフォルトに戻す" }).click();
  await expect(page.getByTestId("prop-color")).toHaveValue("#e91e8c");
  await expect(page.getByTestId("prop-font-size")).toHaveValue("14");
});

test("annotation editor: text box presentation and fit-height controls update the canvas", async ({ page, request }) => {
  const annotationPath = join(process.cwd(), "../../projects/example/annotations/1-1.json");
  const before = JSON.parse(readFileSync(annotationPath, "utf8"));
  await page.goto(`/projects/${testProject}/annotations/${annotationId}`);
  await expect(page.getByTestId("annotation-editor")).toBeVisible();

  try {
    await page.getByTestId("add-text").click();
    await clickCanvas(page, 44, 36);
    await page.getByTestId("text-align").selectOption("center");
    await page.getByTestId("vertical-align").selectOption("middle");
    await page.getByTestId("text-padding").fill("8");
    await page.getByTestId("prop-border-color").fill("#112233");
    await page.getByTestId("border-width").fill("2");
    await page.getByTestId("border-radius").fill("4");
    await page.getByLabel("テキスト内容").fill("行1\n行2\n行3");
    const heightBefore = await page.getByTestId("prop-rect-h").inputValue();
    await page.getByTestId("fit-text-height").click();

    const text = page.locator(".mm-editor-figure .mm-text").last();
    await expect(text).toHaveAttribute("style", /text-align:center/);
    await expect(text).toHaveAttribute("style", /justify-content:center/);
    await expect(text).toHaveAttribute("style", /padding:8px/);
    await expect(text).toHaveAttribute("style", /border:2px solid #112233/);
    await expect(text).toHaveAttribute("style", /border-radius:4px/);
    await expect(page.getByTestId("prop-rect-h")).not.toHaveValue(heightBefore);
  } finally {
    await request.put(`/api/projects/${testProject}/annotations/${annotationId}`, { data: before });
  }
});

test("annotation editor: Cmd/Ctrl+D duplicates and Cmd/Ctrl+S saves from an input", async ({ page, request }) => {
  const annotationPath = join(process.cwd(), "../../projects/example/annotations/1-1.json");
  const before = JSON.parse(readFileSync(annotationPath, "utf8")) as {
    objects: Array<{ id: string; at?: { x: number; y: number } }>;
  };
  await page.goto(`/projects/${testProject}/annotations/${annotationId}`);
  await expect(page.getByTestId("annotation-editor")).toBeVisible();

  try {
    await page.getByTestId("object-item-b1").click();
    const originalX = Number(await page.getByTestId("prop-at-x").inputValue());
    const originalY = Number(await page.getByTestId("prop-at-y").inputValue());
    const initialCount = await page.locator('[data-testid^="object-item-"]').count();
    await page.keyboard.press("Control+d");
    await expect(page.locator('[data-testid^="object-item-"]')).toHaveCount(initialCount + 1);
    await expect(page.getByTestId("prop-at-x")).toHaveValue(String(originalX + 1));
    await expect(page.getByTestId("prop-at-y")).toHaveValue(String(originalY + 1));

    const xInput = page.getByTestId("prop-at-x");
    await xInput.fill(String(originalX + 3));
    const saveResponsePromise = page.waitForResponse(
      (response) => response.url().includes(`/annotations/${annotationId}`) && response.request().method() === "PUT",
    );
    await page.keyboard.press("Control+s");
    expect((await saveResponsePromise).ok()).toBeTruthy();
    await expect(page.getByText("保存しました")).toBeVisible();
    await expect(page.getByText(/⌘S.*保存/)).toBeVisible();
    await expect(page.getByText(/⌘D.*複製/)).toBeVisible();
  } finally {
    await request.put(`/api/projects/${testProject}/annotations/${annotationId}`, { data: before });
  }
});

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
  await clickCanvas(page, 24, 18);
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

test("annotation editor: external change while dirty auto-merges non-conflicting edits", async ({
  page,
  request,
}) => {
  await page.goto(`/projects/${testProject}/annotations/${annotationId}`);
  await expect(page.getByTestId("annotation-editor")).toBeVisible();

  const before = JSON.parse(
    readFileSync(join(process.cwd(), "../../projects/example/annotations/1-1.json"), "utf8"),
  ) as { objects: Array<{ id: string }> };

  try {
    const initialCount = await page.locator('[data-testid^="object-item-"]').count();

    // ローカル編集(未保存 = dirty)
    await page.getByTestId("add-badge").click();
    await clickCanvas(page, 50, 50);
    await expect(page.locator("text=未保存")).toBeVisible();

    // 外部から別IDの追加を書き込む(競合なし)
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

    // 非競合変更は自動マージされ、ローカル追加分と外部追加分の両方が残る
    await expect(page.locator('[data-mm-id="ext-badge"]')).toBeVisible();
    await expect(page.locator('[data-testid^="object-item-"]')).toHaveCount(initialCount + 2);
    await expect(page.locator("text=未保存")).toBeVisible();
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
    await expect(page.getByTestId("annotation-editor")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(renamedId);
  } finally {
    const projectRoot = join(process.cwd(), "../../projects/example");
    for (const candidate of [id, renamedId]) {
      rmSync(join(projectRoot, `annotations/${candidate}.json`), { force: true });
      rmSync(join(projectRoot, `img/raw/${candidate}.png`), { force: true });
      rmSync(join(projectRoot, `img/${candidate}.png`), { force: true });
    }
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
  await clickCanvas(page, 50, 50);
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
