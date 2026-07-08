import type { AnnotationFile, AnnotationObject } from "./schema.js";

const DEFAULT_COLOR = "#E91E8C";
const DEFAULT_BADGE_SIZE = 22;
const DEFAULT_FONT_SIZE = 14;
const DEFAULT_STROKE_WIDTH = 2;

export interface RenderFenceOptions {
  width?: number;
  border?: boolean;
  alt?: string;
  caption?: string;
}

export interface RenderOptions {
  naturalSizes: Record<string, { w: number; h: number }>;
  fence?: RenderFenceOptions;
}

function pct(value: number): string {
  return `${value}%`;
}

function pctToPx(value: number, canvasSize: number): number {
  return Math.round((value / 100) * canvasSize * 10) / 10;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function resolveColor(color: string | undefined): string {
  return color ?? DEFAULT_COLOR;
}

function renderImageObject(
  obj: Extract<AnnotationObject, { type: "image" }>,
  naturalSizes: Record<string, { w: number; h: number }>,
  alt: string,
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

  return `<div class="mm-obj mm-image" style="left:${pct(obj.rect.x)}; top:${pct(obj.rect.y)}; width:${pct(obj.rect.w)}; height:${pct(obj.rect.h)};"><img src="${escapeHtml(obj.src)}" alt="${escapeHtml(alt)}" style="width:${imgWidth}%; height:${imgHeight}%; left:${imgLeft}%; top:${imgTop}%;"></div>`;
}

function renderBadgeObject(obj: Extract<AnnotationObject, { type: "badge" }>): string {
  const styles = [
    `left:${pct(obj.at.x)}`,
    `top:${pct(obj.at.y)}`,
  ];
  const color = resolveColor(obj.color);
  if (color !== DEFAULT_COLOR) {
    styles.push(`background:${color}`);
  }
  if (obj.size !== undefined && obj.size !== DEFAULT_BADGE_SIZE) {
    styles.push(`width:${obj.size}px`, `height:${obj.size}px`);
  }
  return `<span class="mm-obj mm-badge" style="${styles.join("; ")};">${obj.n}</span>`;
}

function renderTextObject(obj: Extract<AnnotationObject, { type: "text" }>): string {
  const styles = [
    `left:${pct(obj.at.x)}`,
    `top:${pct(obj.at.y)}`,
  ];
  if (obj.fontSize !== undefined && obj.fontSize !== DEFAULT_FONT_SIZE) {
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

function renderFrameObject(obj: Extract<AnnotationObject, { type: "frame" }>): string {
  const strokeWidth = obj.strokeWidth ?? DEFAULT_STROKE_WIDTH;
  const color = resolveColor(obj.color);
  const styles = [
    `left:${pct(obj.rect.x)}`,
    `top:${pct(obj.rect.y)}`,
    `width:${pct(obj.rect.w)}`,
    `height:${pct(obj.rect.h)}`,
    `border:${strokeWidth}px solid ${color}`,
  ];
  if (obj.radius !== undefined && obj.radius > 0) {
    styles.push(`border-radius:${obj.radius}px`);
  }
  return `<span class="mm-obj mm-frame" style="${styles.join("; ")};"></span>`;
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
    const color = resolveColor(obj.color);
    const strokeWidth = obj.strokeWidth ?? DEFAULT_STROKE_WIDTH;
    const points = obj.points
      .map((point) => `${pctToPx(point.x, canvas.width)},${pctToPx(point.y, canvas.height)}`)
      .join(" ");

    let markerAttr = "";
    if (obj.type === "arrow") {
      const markerId = `mm-arrow-${obj.id}`;
      defs.push(
        `<marker id="${markerId}" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" refX="9" refY="6" orient="auto"><path d="M0,0 L12,6 L0,12 z" fill="${color}"/></marker>`,
      );
      markerAttr = ` marker-end="url(#${markerId})"`;
    }

    polylines.push(
      `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="${strokeWidth}"${markerAttr}/>`,
    );
  }

  return `<svg class="mm-lines" viewBox="0 0 ${canvas.width} ${canvas.height}" preserveAspectRatio="none">${defs.length > 0 ? `<defs>${defs.join("")}</defs>` : ""}${polylines.join("")}</svg>`;
}

function renderObject(
  obj: AnnotationObject,
  naturalSizes: Record<string, { w: number; h: number }>,
  alt: string,
): string {
  switch (obj.type) {
    case "image":
      return renderImageObject(obj, naturalSizes, alt);
    case "badge":
      return renderBadgeObject(obj);
    case "text":
      return renderTextObject(obj);
    case "frame":
      return renderFrameObject(obj);
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

  const parts = annotation.objects
    .filter((obj) => obj.type !== "line" && obj.type !== "arrow")
    .map((obj) => renderObject(obj, opts.naturalSizes, alt));

  parts.push(renderLinesSvg(lineObjects, canvas));

  if (fence.caption) {
    parts.push(`<figcaption>${escapeHtml(fence.caption)}</figcaption>`);
  }

  return `<figure class="${classes.join(" ")}" style="max-width:${maxWidth}px; aspect-ratio:${canvas.width}/${canvas.height};">${parts.join("")}</figure>`;
}
