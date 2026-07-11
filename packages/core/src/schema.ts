import { z } from "zod";
import { parse as parseYaml } from "yaml";

// SPEC §8: バリデーションエラーは全 issue を日本語で表示する。
// formatIssues が「パス: メッセージ」形式で連結するため、メッセージ本体を日本語化する
const jaErrorMap: z.ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      return issue.received === "undefined"
        ? { message: "必須項目です" }
        : { message: `型が不正です(期待: ${issue.expected} / 実際: ${issue.received})` };
    case z.ZodIssueCode.invalid_literal:
      return { message: `値は ${JSON.stringify(issue.expected)} である必要があります` };
    case z.ZodIssueCode.invalid_enum_value:
      return { message: `許可されていない値です(許可: ${issue.options.join(", ")})` };
    case z.ZodIssueCode.invalid_union_discriminator:
      return { message: `未知の値です(許可: ${issue.options.join(", ")})` };
    case z.ZodIssueCode.invalid_union:
      return { message: "いずれの形式にも一致しません" };
    case z.ZodIssueCode.too_small:
      if (issue.type === "array") {
        return { message: `${issue.minimum}個以上必要です` };
      }
      if (issue.type === "string") {
        return { message: `${issue.minimum}文字以上必要です` };
      }
      return {
        message: issue.inclusive
          ? `${issue.minimum} 以上の値が必要です`
          : `${issue.minimum} より大きい値が必要です`,
      };
    case z.ZodIssueCode.too_big:
      return { message: `${issue.maximum} 以下にしてください` };
    default:
      return { message: ctx.defaultError };
  }
};
z.setErrorMap(jaErrorMap);

const colorSchema = z
  .string()
  .regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, "color は #RGB または #RRGGBB 形式で指定してください");

const pointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const rectSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().gt(0),
  h: z.number().gt(0),
});

// SPEC §4.5: cropは純粋な切り抜き。負値による余白の表現は禁止(余白はexpandCanvas)
const cropNonNegative = "crop の x,y は0以上で指定してください(画像の外側の余白は SPEC §4.5 のキャンバス余白を使用)";
const cropSchema = z.object({
  x: z.number().gte(0, cropNonNegative),
  y: z.number().gte(0, cropNonNegative),
  w: z.number().gt(0),
  h: z.number().gt(0),
});

const baseSchema = z.object({
  id: z.string().min(1),
  source: z.enum(["manual", "recipe"]),
  recipeRef: z.string().optional(),
  locked: z.boolean().optional(),
});

const imageObjectSchema = baseSchema.extend({
  type: z.literal("image"),
  src: z.string().min(1),
  rect: rectSchema,
  crop: cropSchema.optional(),
});

const badgeObjectSchema = baseSchema.extend({
  type: z.literal("badge"),
  n: z.number().int().gte(1),
  at: pointSchema,
  color: colorSchema.optional(),
  size: z.number().gt(0).optional(),
  fontSize: z.number().gt(0).optional(),
});

const textObjectSchema = baseSchema.extend({
  type: z.literal("text"),
  content: z.string(),
  at: pointSchema,
  fontSize: z.number().gt(0).optional(),
  color: colorSchema.optional(),
  background: colorSchema.optional(),
});

export const cursorIconSchema = z.enum(["pointer", "move", "grab", "text", "crosshair"]);
export type CursorIcon = z.infer<typeof cursorIconSchema>;

const cursorObjectSchema = baseSchema.extend({
  type: z.literal("cursor"),
  icon: cursorIconSchema,
  at: pointSchema,
  color: colorSchema.optional(),
  size: z.number().gt(0).optional(),
});

const frameObjectSchema = baseSchema.extend({
  type: z.literal("frame"),
  rect: rectSchema,
  color: colorSchema.optional(),
  strokeWidth: z.number().gt(0).optional(),
  radius: z.number().gte(0).optional(),
});

const linePointsSchema = z.array(pointSchema).min(2);

const lineObjectSchema = baseSchema.extend({
  type: z.literal("line"),
  points: linePointsSchema,
  color: colorSchema.optional(),
  strokeWidth: z.number().gt(0).optional(),
});

const arrowObjectSchema = baseSchema.extend({
  type: z.literal("arrow"),
  points: linePointsSchema,
  color: colorSchema.optional(),
  strokeWidth: z.number().gt(0).optional(),
});

const annotationObjectSchema = z.discriminatedUnion("type", [
  imageObjectSchema,
  badgeObjectSchema,
  textObjectSchema,
  cursorObjectSchema,
  frameObjectSchema,
  lineObjectSchema,
  arrowObjectSchema,
]);

const annotationFileSchema = z
  .object({
    version: z.literal(1),
    canvas: z.object({
      width: z.number().gt(0),
      height: z.number().gt(0),
    }),
    objects: z.array(annotationObjectSchema),
  })
  .superRefine((data, ctx) => {
    const seen = new Set<string>();
    for (const [index, obj] of data.objects.entries()) {
      if (seen.has(obj.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `id が重複しています: ${obj.id}`,
          path: ["objects"],
        });
      }
      seen.add(obj.id);
      // recipeRef の無い recipe オブジェクトは再撮影マージ(§9.4)で
      // 置換も削除もされないゾンビになるため拒否する
      if (obj.source === "recipe" && !obj.recipeRef) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'source が "recipe" のオブジェクトには recipeRef が必要です',
          path: ["objects", index, "recipeRef"],
        });
      }
    }
  });

export type Point = z.infer<typeof pointSchema>;
export type Rect = z.infer<typeof rectSchema>;
export type AnnotationObject = z.infer<typeof annotationObjectSchema>;
export type AnnotationFile = z.infer<typeof annotationFileSchema>;
export { annotationObjectSchema };

export function formatIssues(issues: z.ZodIssue[]): string {
  return issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `${path}: ${issue.message}`;
  }).join("; ");
}

export function parseAnnotation(json: unknown): AnnotationFile {
  const result = annotationFileSchema.safeParse(json);
  if (!result.success) {
    throw new Error(formatIssues(result.error.issues));
  }
  return result.data;
}

const recipeStepSchema = z.union([
  z.object({ waitFor: z.string().min(1) }),
  z.object({ click: z.string().min(1) }),
  z.object({ hover: z.string().min(1) }),
  z.object({
    fill: z.object({
      selector: z.string().min(1),
      value: z.string(),
    }),
  }),
]);

const screenshotClipSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().gt(0),
  h: z.number().gt(0),
});

const screenshotTargetSchema = z.union([
  z.literal("fullPage"),
  z.string().min(1),
  screenshotClipSchema,
]);

const annotateOffsetSchema = z.object({
  dx: z.number(),
  dy: z.number(),
});

const annotateBadgeSchema = z.object({
  type: z.literal("badge"),
  selector: z.string().min(1),
  anchor: z.enum(["left", "right", "top", "bottom", "center"]).optional(),
  offset: annotateOffsetSchema.optional(),
});

const annotateFrameSchema = z.object({
  type: z.literal("frame"),
  selector: z.string().min(1),
  padding: z.number().gte(0).optional(),
});

const annotateItemSchema = z.discriminatedUnion("type", [annotateBadgeSchema, annotateFrameSchema]);

// SPEC §4.5 / §9.1: 撮影領域の外側に確保するキャンバス余白(CSS px)
const screenshotMarginSchema = z.object({
  top: z.number().optional(),
  right: z.number().optional(),
  bottom: z.number().optional(),
  left: z.number().optional(),
});

const captureRecipeSchema = z.object({
  title: z.string().optional(),
  url: z.string().min(1, "url は必須です"),
  viewport: z
    .object({
      width: z.number().gt(0),
      height: z.number().gt(0),
    })
    .optional(),
  steps: z.array(recipeStepSchema).optional(),
  screenshot: z.object({
    target: screenshotTargetSchema,
    margin: screenshotMarginSchema.optional(),
  }),
  output: z.string().min(1),
  annotate: z.array(annotateItemSchema).optional(),
});

export type CaptureRecipe = z.infer<typeof captureRecipeSchema>;
export type RecipeStep = z.infer<typeof recipeStepSchema>;
export type AnnotateItem = z.infer<typeof annotateItemSchema>;

export function parseRecipe(yamlText: string): CaptureRecipe {
  const parsed = parseYaml(yamlText);
  const result = captureRecipeSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(formatIssues(result.error.issues));
  }
  return result.data;
}
