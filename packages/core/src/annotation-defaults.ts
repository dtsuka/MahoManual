import type { AnnotationObject, TextAlign, TextVerticalAlign } from "./schema.js";
import {
  DEFAULT_ANNOTATION_COLOR,
  DEFAULT_ANNOTATION_FONT_SIZE,
  DEFAULT_CURSOR_COLOR,
  type AnnotationTheme,
} from "./theme.js";

export type AnnotationDefaults = {
  badge?: Partial<Pick<Extract<AnnotationObject, { type: "badge" }>, "color" | "size" | "fontSize">>;
  text?: Partial<Pick<Extract<AnnotationObject, { type: "text" }>, "color" | "fontSize" | "background" | "textAlign" | "verticalAlign" | "padding" | "borderColor" | "borderWidth" | "borderRadius">>;
  cursor?: Partial<Pick<Extract<AnnotationObject, { type: "cursor" }>, "color" | "size" | "icon">>;
  frame?: Partial<Pick<Extract<AnnotationObject, { type: "frame" }>, "color" | "strokeWidth" | "radius">>;
  line?: Partial<Pick<Extract<AnnotationObject, { type: "line" }>, "color" | "strokeWidth">>;
  arrow?: Partial<Pick<Extract<AnnotationObject, { type: "arrow" }>, "color" | "strokeWidth" | "arrowHeads">>;
  mosaic?: Partial<Pick<Extract<AnnotationObject, { type: "mosaic" }>, "blockSize">>;
};

export type ObjectStylePatch = Partial<{
  color: string;
  size: number;
  fontSize: number;
  background: string;
  textAlign: TextAlign;
  verticalAlign: TextVerticalAlign;
  padding: number;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  strokeWidth: number;
  radius: number;
  icon: Extract<AnnotationObject, { type: "cursor" }>["icon"];
  arrowHeads: Extract<AnnotationObject, { type: "arrow" }>["arrowHeads"];
  blockSize: number;
}>;

const STYLE_KEYS_BY_TYPE: Record<AnnotationObject["type"], readonly (keyof ObjectStylePatch)[]> = {
  badge: ["color", "size", "fontSize"],
  text: ["color", "fontSize", "background", "textAlign", "verticalAlign", "padding", "borderColor", "borderWidth", "borderRadius"],
  cursor: ["color", "size", "icon"],
  frame: ["color", "strokeWidth", "radius"],
  line: ["color", "strokeWidth"],
  arrow: ["color", "strokeWidth", "arrowHeads"],
  mosaic: ["blockSize"],
  image: [],
};

function filterStyle(type: AnnotationObject["type"], style: ObjectStylePatch): ObjectStylePatch {
  const filtered: ObjectStylePatch = {};
  for (const key of STYLE_KEYS_BY_TYPE[type]) {
    if (style[key] !== undefined) {
      (filtered as Record<string, unknown>)[key] = style[key];
    }
  }
  return filtered;
}

export function extractObjectStyle(obj: AnnotationObject): ObjectStylePatch {
  const style: ObjectStylePatch = {};
  for (const key of STYLE_KEYS_BY_TYPE[obj.type]) {
    if (key in obj && obj[key as keyof AnnotationObject] !== undefined) {
      (style as Record<string, unknown>)[key] = obj[key as keyof AnnotationObject];
    }
  }
  return style;
}

export function applyObjectStyle(obj: AnnotationObject, style: ObjectStylePatch): AnnotationObject {
  const next = { ...obj } as AnnotationObject & ObjectStylePatch;
  for (const key of STYLE_KEYS_BY_TYPE[obj.type]) {
    if (style[key] !== undefined) {
      (next as Record<string, unknown>)[key] = style[key];
    }
  }
  return next;
}

export function copyObjectStyle(from: AnnotationObject, to: AnnotationObject): AnnotationObject {
  return applyObjectStyle(to, extractObjectStyle(from));
}

export function resolveCreationDefaults<T extends AnnotationObject["type"]>(
  type: T,
  options: {
    objectPatch?: ObjectStylePatch;
    projectDefaults?: AnnotationDefaults;
    theme?: AnnotationTheme;
  },
): ObjectStylePatch {
  const { objectPatch, projectDefaults, theme } = options;
  const typeDefaults = projectDefaults?.[type as keyof AnnotationDefaults] ?? {};
  const themeDefaults: ObjectStylePatch = {
    color: theme?.color ?? DEFAULT_ANNOTATION_COLOR,
    fontSize: theme?.fontSize ?? DEFAULT_ANNOTATION_FONT_SIZE,
  };
  const coreDefaults: Record<AnnotationObject["type"], ObjectStylePatch> = {
    badge: { color: DEFAULT_ANNOTATION_COLOR, size: 22, fontSize: DEFAULT_ANNOTATION_FONT_SIZE },
    text: {
      color: DEFAULT_ANNOTATION_COLOR,
      fontSize: DEFAULT_ANNOTATION_FONT_SIZE,
      textAlign: "left",
      verticalAlign: "top",
      padding: 0,
      borderWidth: 0,
      borderRadius: 0,
    },
    cursor: { color: DEFAULT_CURSOR_COLOR, size: 28, icon: "pointer" },
    frame: { color: DEFAULT_ANNOTATION_COLOR, strokeWidth: 2, radius: 0 },
    line: { color: DEFAULT_ANNOTATION_COLOR, strokeWidth: 2 },
    arrow: { color: DEFAULT_ANNOTATION_COLOR, strokeWidth: 2, arrowHeads: "end" },
    mosaic: { blockSize: 12 },
    image: {},
  };
  return filterStyle(type, {
    ...coreDefaults[type],
    ...themeDefaults,
    ...typeDefaults,
    ...objectPatch,
  });
}

export function parseAnnotationDefaults(value: unknown): AnnotationDefaults {
  if (!value || typeof value !== "object") {
    return {};
  }
  return value as AnnotationDefaults;
}
