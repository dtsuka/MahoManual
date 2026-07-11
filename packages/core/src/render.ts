import { mosaicsForImage } from "./annotation-objects.js";
import type { AnnotationFile, AnnotationObject, ArrowHeads } from "./schema.js";
import { DEFAULT_CURSOR_COLOR } from "./theme.js";

// 既定の色・サイズはテーマ CSS(CSS カスタムプロパティ)が持つ。
// レンダラーはオブジェクトに明示指定があるときだけ inline style を出力する
const DEFAULT_STROKE_WIDTH = 2;

export interface RenderFenceOptions {
  width?: number;
  border?: boolean;
  alt?: string;
  caption?: string;
}

export interface RenderOptions {
  naturalSizes: Record<string, { w: number; h: number }>;
  imageSources?: Record<string, string>;
  fence?: RenderFenceOptions;
}

function pct(value: number): string {
  return `${value}%`;
}

function pctToPx(value: number, canvasSize: number): number {
  return Math.round((value / 100) * canvasSize * 10) / 10;
}

export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderImageObject(
  obj: Extract<AnnotationObject, { type: "image" }>,
  naturalSizes: Record<string, { w: number; h: number }>,
  alt: string,
  renderedSrc?: string,
): string {
  const natural = naturalSizes[obj.src];
  if (!natural) {
    throw new Error(`natural size not found for ${obj.src}`);
  }

  const crop = obj.crop ?? { x: 0, y: 0, w: natural.w, h: natural.h };
  const imgWidth = (natural.w / crop.w) * 100;
  const imgHeight = (natural.h / crop.h) * 100;
  const imgLeft = (-crop.x / crop.w) * 100;
  const imgTop = (-crop.y / crop.h) * 100;

  return `<div class="mm-obj mm-image" style="left:${pct(obj.rect.x)}; top:${pct(obj.rect.y)}; width:${pct(obj.rect.w)}; height:${pct(obj.rect.h)};"><img src="${escapeHtml(renderedSrc ?? obj.src)}" alt="${escapeHtml(alt)}" style="width:${imgWidth}%; height:${imgHeight}%; left:${imgLeft}%; top:${imgTop}%;"></div>`;
}

function renderMosaicObject(obj: Extract<AnnotationObject, { type: "mosaic" }>): string {
  const blockSize = obj.blockSize ?? 12;
  const blur = Math.max(2, blockSize / 3);
  return `<div class="mm-obj mm-mosaic" style="left:${pct(obj.rect.x)}; top:${pct(obj.rect.y)}; width:${pct(obj.rect.w)}; height:${pct(obj.rect.h)}; --mm-mosaic-size:${blockSize}px; backdrop-filter:blur(${blur}px); background-image:repeating-linear-gradient(45deg, rgba(255,255,255,.08) 0 1px, rgba(0,0,0,.08) 1px 2px);"></div>`;
}

function renderBadgeObject(obj: Extract<AnnotationObject, { type: "badge" }>): string {
  const styles = [
    `left:${pct(obj.at.x)}`,
    `top:${pct(obj.at.y)}`,
  ];
  if (obj.color) {
    styles.push(`background:${obj.color}`);
  }
  if (obj.size !== undefined) {
    styles.push(`width:${obj.size}px`, `height:${obj.size}px`);
  }
  if (obj.fontSize !== undefined) {
    styles.push(`font-size:${obj.fontSize}px`);
  }
  return `<span class="mm-obj mm-badge" style="${styles.join("; ")};">${obj.n}</span>`;
}

function renderTextObject(obj: Extract<AnnotationObject, { type: "text" }>): string {
  const styles = [
    `left:${pct(obj.at.x)}`,
    `top:${pct(obj.at.y)}`,
  ];
  if (obj.fontSize !== undefined) {
    styles.push(`font-size:${obj.fontSize}px`);
  }
  if (obj.color) {
    styles.push(`color:${obj.color}`);
  }
  if (obj.background) {
    styles.push(`background:${obj.background}`);
  }
  return `<span class="mm-obj mm-text" style="${styles.join("; ")};">${escapeHtml(obj.content)}</span>`;
}

const CURSOR_ICON_CONTENT = {
  pointer: '<path d="m4 3 7.2 17.2 2.5-7.4 7.3-2.5L4 3Z" fill="currentColor" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>',
  move: '<path d="M12 2v20M2 12h20M12 2 9 5m3-3 3 3M12 22l-3-3m3 3 3-3M2 12l3-3m-3 3 3 3m17-3-3-3m3 3-3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  grab: '<path d="M6.5 11V7.5a1.5 1.5 0 0 1 3 0V10m0-3.5V5a1.5 1.5 0 0 1 3 0v5m0-3.5V5.5a1.5 1.5 0 0 1 3 0V10m0-2.5a1.5 1.5 0 0 1 3 0V14c0 4.4-2.6 8-7 8h-1c-2.7 0-4.3-1.5-5.5-3.5L3.2 15a1.7 1.7 0 0 1 2.8-1.9L8 15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  text: '<path d="M5 4h14M9 4v16m6-16v16M5 20h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  crosshair: '<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
} as const;

function renderCursorObject(obj: Extract<AnnotationObject, { type: "cursor" }>): string {
  const size = obj.size ?? 28;
  const styles = [
    `left:${pct(obj.at.x)}`,
    `top:${pct(obj.at.y)}`,
    `width:${size}px`,
    `height:${size}px`,
  ];
  if (obj.icon !== "pointer") {
    styles.push("transform:translate(-50%,-50%)");
  }
  styles.push(`color:${obj.color ?? DEFAULT_CURSOR_COLOR}`);
  return `<span class="mm-obj mm-cursor" data-cursor-icon="${obj.icon}" style="${styles.join("; ")};"><svg viewBox="0 0 24 24" aria-hidden="true">${CURSOR_ICON_CONTENT[obj.icon]}</svg></span>`;
}

function renderFrameObject(obj: Extract<AnnotationObject, { type: "frame" }>): string {
  const styles = [
    `left:${pct(obj.rect.x)}`,
    `top:${pct(obj.rect.y)}`,
    `width:${pct(obj.rect.w)}`,
    `height:${pct(obj.rect.h)}`,
  ];
  if (obj.color || obj.strokeWidth !== undefined) {
    // 色が未指定なら var(--mm-color) でテーマ色に追従させる
    styles.push(
      `border:${obj.strokeWidth ?? DEFAULT_STROKE_WIDTH}px solid ${obj.color ?? "var(--mm-color)"}`,
    );
  }
  if (obj.radius !== undefined && obj.radius > 0) {
    styles.push(`border-radius:${obj.radius}px`);
  }
  return `<span class="mm-obj mm-frame" style="${styles.join("; ")};"></span>`;
}

function resolveArrowHeads(obj: Extract<AnnotationObject, { type: "arrow" }>): ArrowHeads {
  return obj.arrowHeads ?? "end";
}

function buildArrowMarkerAttrs(
  objectId: string,
  heads: ArrowHeads,
  defs: string[],
  markerFill: string,
): string {
  const attrs: string[] = [];

  if (heads === "start" || heads === "both") {
    const startId = `mm-arrow-${objectId}-start`;
    defs.push(
      `<marker id="${startId}" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" refX="9" refY="6" orient="auto-start-reverse"><path d="M0,0 L12,6 L0,12 z"${markerFill}/></marker>`,
    );
    attrs.push(`marker-start="url(#${startId})"`);
  }
  if (heads === "end" || heads === "both") {
    const endId = `mm-arrow-${objectId}`;
    defs.push(
      `<marker id="${endId}" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" refX="9" refY="6" orient="auto"><path d="M0,0 L12,6 L0,12 z"${markerFill}/></marker>`,
    );
    attrs.push(`marker-end="url(#${endId})"`);
  }

  return attrs.length > 0 ? ` ${attrs.join(" ")}` : "";
}

function renderLinesSvg(
  lineObjects: Array<Extract<AnnotationObject, { type: "line" | "arrow" }>>,
  canvas: AnnotationFile["canvas"],
): string {
  if (lineObjects.length === 0) {
    return "";
  }

  const defs: string[] = [];
  const polylines: string[] = [];

  for (const obj of lineObjects) {
    const points = obj.points
      .map((point) => `${pctToPx(point.x, canvas.width)},${pctToPx(point.y, canvas.height)}`)
      .join(" ");

    // 指定時のみ style 属性で出力する(属性ではなく style にするのは、
    // テーマ CSS の var(--mm-color) 既定より優先させるため)
    const styleParts: string[] = [];
    if (obj.color) {
      styleParts.push(`stroke:${obj.color}`);
    }
    if (obj.strokeWidth !== undefined) {
      styleParts.push(`stroke-width:${obj.strokeWidth}`);
    }
    const styleAttr = styleParts.length > 0 ? ` style="${styleParts.join("; ")}"` : "";

    let markerAttr = "";
    if (obj.type === "arrow") {
      const markerFill = obj.color ? ` style="fill:${obj.color}"` : "";
      markerAttr = buildArrowMarkerAttrs(obj.id, resolveArrowHeads(obj), defs, markerFill);
    }

    polylines.push(
      `<polyline points="${points}" data-mm-id="${escapeHtml(obj.id)}"${styleAttr}${markerAttr}/>`,
    );
  }

  return `<svg class="mm-lines" viewBox="0 0 ${canvas.width} ${canvas.height}" preserveAspectRatio="none">${defs.length > 0 ? `<defs>${defs.join("")}</defs>` : ""}${polylines.join("")}</svg>`;
}

function renderObject(
  obj: AnnotationObject,
  naturalSizes: Record<string, { w: number; h: number }>,
  alt: string,
  imageSources?: Record<string, string>,
): string {
  switch (obj.type) {
    case "image":
      return renderImageObject(obj, naturalSizes, alt, imageSources?.[obj.id]);
    case "badge":
      return renderBadgeObject(obj);
    case "text":
      return renderTextObject(obj);
    case "cursor":
      return renderCursorObject(obj);
    case "frame":
      return renderFrameObject(obj);
    case "mosaic":
      return "";
    case "line":
    case "arrow":
      return "";
    default: {
      const _exhaustive: never = obj;
      return _exhaustive;
    }
  }
}

export function renderFigure(annotation: AnnotationFile, opts: RenderOptions): string {
  const fence = opts.fence ?? {};
  const maxWidth = fence.width ?? 1000;
  const printClass = maxWidth <= 680 ? "mm-print-s" : "mm-print-l";
  const classes = ["mm", printClass];
  if (fence.border) {
    classes.push("mm-border");
  }

  const alt = fence.alt ?? "";
  const { canvas } = annotation;
  const lineObjects = annotation.objects.filter(
    (obj): obj is Extract<AnnotationObject, { type: "line" | "arrow" }> =>
      obj.type === "line" || obj.type === "arrow",
  );

  const parts: string[] = [];
  for (const obj of annotation.objects) {
    if (obj.type === "line" || obj.type === "arrow" || obj.type === "mosaic") {
      continue;
    }
    parts.push(renderObject(obj, opts.naturalSizes, alt, opts.imageSources));
    if (obj.type === "image") {
      parts.push(...mosaicsForImage(annotation.objects, obj.id).map(renderMosaicObject));
    }
  }

  parts.push(renderLinesSvg(lineObjects, canvas));

  if (fence.caption) {
    parts.push(`<figcaption>${escapeHtml(fence.caption)}</figcaption>`);
  }

  return `<figure class="${classes.join(" ")}" style="max-width:${maxWidth}px; aspect-ratio:${canvas.width}/${canvas.height};">${parts.join("")}</figure>`;
}
