import { imageSize } from "image-size";

export type ParsedUploadedImage =
  | { ok: true; buffer: Buffer; width: number; height: number }
  | { ok: false; error: string };

// data URI で宣言できる形式と、デコード結果として受け付ける形式(image-size の type)
const DATA_URI_PREFIX_RE = /^data:image\/(png|jpe?g|webp|gif);base64,/i;
const ALLOWED_TYPES = new Set(["png", "jpg", "webp", "gif"]);

/**
 * アップロードされた data URI(PNG / JPEG / WebP / GIF)をデコードし、画像の実サイズを返す。
 * クライアントが送る width / height は使わない(画像ファイルの実ピクセルを正とする。SPEC §4.1)
 */
export function parseUploadedImage(data: unknown): ParsedUploadedImage {
  if (typeof data !== "string") {
    return { ok: false, error: "画像データ(data URI)を文字列で指定してください" };
  }
  const prefix = data.match(DATA_URI_PREFIX_RE);
  if (!prefix) {
    return { ok: false, error: "画像データが不正です(PNG / JPEG / WebP / GIF の data URI のみ受け付けます)" };
  }
  const buffer = Buffer.from(data.slice(prefix[0].length), "base64");
  if (buffer.length === 0) {
    return { ok: false, error: "画像データが空です" };
  }
  let detected: ReturnType<typeof imageSize>;
  try {
    detected = imageSize(buffer);
  } catch {
    return { ok: false, error: "画像として読み込めません" };
  }
  if (!detected.type || !ALLOWED_TYPES.has(detected.type)) {
    return { ok: false, error: "PNG / JPEG / WebP / GIF 以外の画像は取り込めません" };
  }
  const { width, height } = detected;
  if (!width || !height) {
    return { ok: false, error: "画像サイズを取得できません" };
  }
  return { ok: true, buffer, width, height };
}
