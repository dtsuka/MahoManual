import { z } from "zod";
import { parse as parseYaml } from "yaml";

const colorSchema = z
  .string()
  .regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, "color must be #RGB or #RRGGBB");

const pointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const rectSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().gt(0, "rect.w must be > 0"),
  h: z.number().gt(0, "rect.h must be > 0"),
});

const cropSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().gt(0),
  h: z.number().gt(0),
});

const baseSchema = z.object({
  id: z.string().min(1),
  source: z.enum(["manual", "recipe"]),
  recipeRef: z.string().optional(),
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
});

const textObjectSchema = baseSchema.extend({
  type: z.literal("text"),
  content: z.string(),
  at: pointSchema,
  fontSize: z.number().gt(0).optional(),
  color: colorSchema.optional(),
  background: colorSchema.optional(),
});

const frameObjectSchema = baseSchema.extend({
  type: z.literal("frame"),
  rect: rectSchema,
  color: colorSchema.optional(),
  strokeWidth: z.number().gt(0).optional(),
  radius: z.number().gte(0).optional(),
});

const linePointsSchema = z
  .array(pointSchema)
  .min(2, "line/arrow points must have at least 2 points");

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
  frameObjectSchema,
  lineObjectSchema,
  arrowObjectSchema,
]);

const annotationFileSchema = z
  .object({
    version: z.literal(1),
    canvas: z.object({
      width: z.number().gt(0, "canvas.width must be > 0"),
      height: z.number().gt(0, "canvas.height must be > 0"),
    }),
    objects: z.array(annotationObjectSchema),
  })
  .superRefine((data, ctx) => {
    const seen = new Set<string>();
    for (const obj of data.objects) {
      if (seen.has(obj.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate object id: ${obj.id}`,
          path: ["objects"],
        });
      }
      seen.add(obj.id);
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

const captureRecipeSchema = z.object({
  title: z.string().optional(),
  url: z.string().min(1, "url is required"),
  viewport: z
    .object({
      width: z.number().gt(0),
      height: z.number().gt(0),
    })
    .optional(),
  steps: z.array(recipeStepSchema).optional(),
  screenshot: z.object({
    target: screenshotTargetSchema,
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
