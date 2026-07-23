import { imageSize } from "image-size";

export type ParsedUploadedImage =
  | { ok: true; buffer: Buffer; width: number; height: number }
  | { ok: false; error: string };

export interface ParseUploadedImageOptions {
  width?: number;
  height?: number;
  fallback?: { width: number; height: number };
  strictMime?: boolean;
}

const LOOSE_DATA_URI_RE = /^data:image\/\w+;base64,/;
const STRICT_DATA_URI_RE = /^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/s;

// アップロードされた data URI をデコードし、幅・高さを解決する。
// POST /images はプレフィックスを緩く剥がし未指定サイズを fallback で補うのに対し、
// 注釈画像系のルートは MIME を厳密に検証しサイズ未検出をエラーにする
export function parseUploadedImage(
  data: string | undefined,
  options: ParseUploadedImageOptions = {},
): ParsedUploadedImage {
  const { width, height, fallback, strictMime = false } = options;

  if (strictMime) {
    const match = data?.match(STRICT_DATA_URI_RE);
    if (!match) {
      return { ok: false, error: "画像データが不正です" };
    }
    const buffer = Buffer.from(match[2]!, "base64");
    const detected = imageSize(buffer);
    const resolvedWidth = width ?? detected.width;
    const resolvedHeight = height ?? detected.height;
    if (!resolvedWidth || !resolvedHeight) {
      return { ok: false, error: "画像サイズを取得できません" };
    }
    return { ok: true, buffer, width: resolvedWidth, height: resolvedHeight };
  }

  const buffer = Buffer.from((data ?? "").replace(LOOSE_DATA_URI_RE, ""), "base64");
  let resolvedWidth = width;
  let resolvedHeight = height;
  if (!resolvedWidth || !resolvedHeight) {
    const detected = imageSize(buffer);
    resolvedWidth = detected.width ?? fallback?.width;
    resolvedHeight = detected.height ?? fallback?.height;
  }
  if (!resolvedWidth || !resolvedHeight) {
    return { ok: false, error: "画像サイズを取得できません" };
  }
  return { ok: true, buffer, width: resolvedWidth, height: resolvedHeight };
}
