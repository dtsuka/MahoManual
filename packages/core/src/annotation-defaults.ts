import { z } from "zod";
import type { AnnotationObject, TextAlign, TextVerticalAlign } from "./schema.js";
import {
  arrowHeadsSchema,
  cursorIconSchema,
  formatIssues,
  textAlignSchema,
  textVerticalAlignSchema,
} from "./schema.js";
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

const defaultsColorSchema = z
  .string()
  .regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, "color は #RGB または #RRGGBB 形式で指定してください");
const positiveNumber = z.number().finite().gt(0);
const nonNegativeNumber = z.number().finite().gte(0);

// project.yaml の annotation.defaults(種類別の作成既定値)の形。
// 値の制約は注釈JSONのスキーマ(schema.ts)の同名フィールドと同じにする
const defaultsFieldSchemas = {
  badge: { color: defaultsColorSchema, size: positiveNumber, fontSize: positiveNumber },
  text: {
    color: defaultsColorSchema,
    fontSize: positiveNumber,
    background: defaultsColorSchema,
    textAlign: textAlignSchema,
    verticalAlign: textVerticalAlignSchema,
    padding: nonNegativeNumber,
    borderColor: defaultsColorSchema,
    borderWidth: nonNegativeNumber,
    borderRadius: nonNegativeNumber,
  },
  cursor: { color: defaultsColorSchema, size: positiveNumber, icon: cursorIconSchema },
  frame: { color: defaultsColorSchema, strokeWidth: positiveNumber, radius: nonNegativeNumber },
  line: { color: defaultsColorSchema, strokeWidth: positiveNumber },
  arrow: { color: defaultsColorSchema, strokeWidth: positiveNumber, arrowHeads: arrowHeadsSchema },
  mosaic: { blockSize: z.number().finite().gte(2) },
} as const;

type DefaultsType = keyof typeof defaultsFieldSchemas;

const typeDefaultsSchema = <T extends z.ZodRawShape>(fields: T) => z.object(fields).partial().strict().optional();

export const annotationDefaultsSchema = z
  .object({
    badge: typeDefaultsSchema(defaultsFieldSchemas.badge),
    text: typeDefaultsSchema(defaultsFieldSchemas.text),
    cursor: typeDefaultsSchema(defaultsFieldSchemas.cursor),
    frame: typeDefaultsSchema(defaultsFieldSchemas.frame),
    line: typeDefaultsSchema(defaultsFieldSchemas.line),
    arrow: typeDefaultsSchema(defaultsFieldSchemas.arrow),
    mosaic: typeDefaultsSchema(defaultsFieldSchemas.mosaic),
  })
  .strict();

/**
 * 保存前の検査。未知の種類・未知のキー・型や範囲の誤りがあればエラーにする
 */
export function validateAnnotationDefaults(value: unknown): AnnotationDefaults {
  const result = annotationDefaultsSchema.safeParse(value);
  if (!result.success) {
    throw new Error(`annotation.defaults が不正です: ${formatIssues(result.error.issues)}`);
  }
  return result.data as AnnotationDefaults;
}

/**
 * project.yaml から読むときの解釈。手書きの誤りで画面全体が壊れないよう、
 * 不正な種類・キー・値だけを捨てて正しい値は残す
 */
export function parseAnnotationDefaults(value: unknown): AnnotationDefaults {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const parsed: Record<string, Record<string, unknown>> = {};
  for (const [type, fields] of Object.entries(defaultsFieldSchemas) as Array<
    [DefaultsType, Record<string, z.ZodTypeAny>]
  >) {
    const raw = (value as Record<string, unknown>)[type];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      continue;
    }
    const kept: Record<string, unknown> = {};
    for (const [key, schema] of Object.entries(fields)) {
      const fieldValue = (raw as Record<string, unknown>)[key];
      if (fieldValue !== undefined && schema.safeParse(fieldValue).success) {
        kept[key] = fieldValue;
      }
    }
    if (Object.keys(kept).length > 0) {
      parsed[type] = kept;
    }
  }
  return parsed as AnnotationDefaults;
}
