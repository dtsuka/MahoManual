export {
  buildPreviewHtml,
  buildProject,
  getNaturalSizes,
  type BuildOptions,
  type BuildResult,
  type PreviewOptions,
} from "./build.js";
export { runAllCaptures, runCapture, type RunCaptureOptions, type RunCaptureResult } from "./capture.js";
export {
  badgePointFromBox,
  frameRectFromBox,
  type BadgeAnchor,
  type BadgePlacementOptions,
  type BoundingBox,
  type PointPct,
  type RectPct,
  type Region,
} from "./capture-math.js";
export { mergeAnnotations } from "./merge-annotations.js";
export { renderAnnotationPng } from "./export-image.js";
export { exportPdf, type ExportPdfOptions } from "./pdf.js";
export {
  addAnnotationObject,
  buildManualHtml,
  countAnnotationBadges,
  countUnicodeBadges,
  createManualProject,
  createAnnotationSkeleton,
  exportManualPdf,
  listManuals,
  listRecipeFiles,
  loadRecipeFile,
  readAnnotationFile,
  readManual,
  readProjectYaml,
  removeAnnotationObject,
  renumberBadges,
  renumberBadgesFile,
  runProjectCapture,
  savePastedImage,
  setCrop,
  updateAnnotationObject,
  writeAnnotationFile,
  type ManualContents,
  type ProjectInfo,
} from "./project.js";
export {
  formatIssues,
  parseAnnotation,
  parseRecipe,
  type AnnotateItem,
  type AnnotationFile,
  type AnnotationObject,
  type CaptureRecipe,
  type CursorIcon,
  type RecipeStep,
} from "./schema.js";
export { renderFigure, type RenderFenceOptions, type RenderOptions } from "./render.js";
export { DEFAULT_CURSOR_COLOR, THEME_CSS } from "./theme.js";
