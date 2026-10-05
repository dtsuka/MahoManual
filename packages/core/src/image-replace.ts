import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { writeAnnotationFileAtomic, writeFileAtomic } from "./atomic-write.js";
import { readAnnotationFile, savePastedImage } from "./project.js";
import { annotationFilePath, assertSafeName, resolveInside } from "./safe-name.js";
import { formatIssues, parseAnnotation, type AnnotationFile } from "./schema.js";
import { ZodError } from "zod";

export type ImageOperationErrorReason = "not-found" | "locked" | "conflict" | "invalid";

/** 画像の取り込み・差し替えで、原因ごとに呼び出し側が応答を変えられるようにするエラー */
export class ImageOperationError extends Error {
  constructor(
    message: string,
    readonly reason: ImageOperationErrorReason,
  ) {
    super(message);
    this.name = "ImageOperationError";
  }
}

interface PixelSize {
  width: number;
  height: number;
}

function assertImageSize(size: PixelSize, label: string): void {
  const valid = (value: number) => Number.isFinite(value) && value > 0;
  if (!valid(size.width) || !valid(size.height)) {
    throw new ImageOperationError(`${label}は1px以上の数値で指定してください`, "invalid");
  }
}

function validated(annotation: unknown): AnnotationFile {
  try {
    return parseAnnotation(annotation);
  } catch (error) {
    const message =
      error instanceof ZodError ? formatIssues(error.issues) : error instanceof Error ? error.message : String(error);
    throw new ImageOperationError(message, "invalid");
  }
}

// 失敗時に元へ戻すため、書き込み前のファイル内容を控える(存在しなければ null)
function snapshot(path: string): Buffer | null {
  return existsSync(path) ? readFileSync(path) : null;
}

function restore(path: string, previous: Buffer | null): void {
  try {
    if (previous === null) {
      rmSync(path, { force: true });
    } else {
      writeFileSync(path, previous);
    }
  } catch {
    // 元に戻す処理の失敗で、最初のエラーを隠さない
  }
}

/**
 * 注釈内の image オブジェクトの画像ファイルを差し替える(SPEC §11 の「置換」)。
 *
 * - ロック中の画像は差し替えない(locked 省略のベース画像は既定でロック扱い)
 * - 新しい注釈JSONを先に検査し、画像→JSONの順に書く。JSONの書き込みに失敗したら画像を元に戻す
 * - crop は新しい画像の全体にし、キャンバス全面に置かれた画像ならキャンバスも新しいサイズに合わせる
 */
export function replaceImageObject(
  projectRoot: string,
  annotationId: string,
  objectId: string,
  buffer: Uint8Array,
  natural: PixelSize,
): AnnotationFile {
  assertSafeName(annotationId, "注釈ID");
  assertSafeName(objectId, "オブジェクトID");
  if (!existsSync(annotationFilePath(projectRoot, annotationId))) {
    throw new ImageOperationError(`注釈ファイルが見つかりません: ${annotationId}`, "not-found");
  }
  const annotation = readAnnotationFile(projectRoot, annotationId);
  const image = annotation.objects.find(
    (obj): obj is Extract<AnnotationFile["objects"][number], { type: "image" }> =>
      obj.id === objectId && obj.type === "image",
  );
  if (!image) {
    throw new ImageOperationError(`imageオブジェクトが見つかりません: ${objectId}`, "not-found");
  }
  if (image.locked) {
    throw new ImageOperationError(
      `ロックされた画像は差し替えできません。ロックを解除してください: ${objectId}`,
      "locked",
    );
  }
  assertImageSize(natural, "画像サイズ");

  const fullCanvas =
    image.rect.x === 0 && image.rect.y === 0 && image.rect.w === 100 && image.rect.h === 100;
  const updated = validated({
    ...annotation,
    canvas: fullCanvas ? { width: natural.width, height: natural.height } : annotation.canvas,
    objects: annotation.objects.map((obj) =>
      obj.id === objectId && obj.type === "image"
        ? { ...obj, crop: { x: 0, y: 0, w: natural.width, h: natural.height } }
        : obj,
    ),
  });

  const target = resolveInside(projectRoot, image.src);
  const previous = snapshot(target);
  mkdirSync(dirname(target), { recursive: true });
  writeFileAtomic(target, buffer);
  try {
    return writeAnnotationFileAtomic(projectRoot, annotationId, updated);
  } catch (error) {
    restore(target, previous);
    throw error;
  }
}

/**
 * 貼り付け・取り込んだ画像を img/raw/<id>.png に保存し、注釈JSONの雛形を作る。
 * project.ts の savePastedImage を、事前検査と失敗時の後始末付きで呼ぶ
 *
 * - 同じIDの注釈が既にあれば何も書かない
 * - 雛形の注釈(キャンバスサイズ)を先に検査し、不正なら画像を書かない
 * - 途中で失敗したら、書いた画像と注釈を元に戻す
 */
export function importPastedImage(
  projectRoot: string,
  id: string,
  buffer: Buffer,
  canvas: PixelSize,
): { imagePath: string; annotation: AnnotationFile } {
  assertSafeName(id, "注釈ID");
  const annotationPath = annotationFilePath(projectRoot, id);
  if (existsSync(annotationPath)) {
    throw new ImageOperationError(`注釈IDが既に存在します: ${id}`, "conflict");
  }
  assertImageSize(canvas, "キャンバスサイズ");
  const src = `img/raw/${id}.png`;
  validated({
    version: 1,
    canvas,
    objects: [
      { id: "img-main", type: "image", source: "manual", locked: true, src, rect: { x: 0, y: 0, w: 100, h: 100 } },
    ],
  });

  const rawPath = join(projectRoot, src);
  const displayPath = join(projectRoot, "img", `${id}.png`);
  const previousRaw = snapshot(rawPath);
  const previousDisplay = snapshot(displayPath);
  try {
    return savePastedImage(projectRoot, id, buffer, canvas);
  } catch (error) {
    restore(rawPath, previousRaw);
    restore(displayPath, previousDisplay);
    restore(annotationPath, null);
    throw error;
  }
}
