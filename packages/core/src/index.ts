export {
  applyDefaultImageLocks,
  collectImageSources,
  isAddedImageSrc,
  isBaseImage,
  isEditable,
  isLineObject,
  isRectObject,
  mosaicsForImage,
  taggableObjectsInDisplayOrder,
  type ImageObject,
  type LineObject,
  type MosaicObject,
  type RectObject,
  type TaggableObject,
} from "./annotation-objects.js";
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
export { expandCanvas, type CanvasMargin } from "./expand-canvas.js";
export { mergeAnnotations } from "./merge-annotations.js";
export { applyMosaicsToImage, mosaicRegionsForImage, type MosaicPixelRegion } from "./mosaic.js";
export { renderAnnotationPng } from "./export-image.js";
export {
  renderManualHtmlDownload,
  renderManualPdfDownload,
} from "./export-artifact.js";
export { exportPdf, type ExportPdfOptions } from "./pdf.js";
export {
  addAnnotationObject,
  addPastedImageObject,
  buildManualHtml,
  countAnnotationBadges,
  countUnicodeBadges,
  createManualProject,
  createAnnotationSkeleton,
  expandCanvasFile,
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
  arrowHeadsSchema,
  formatIssues,
  parseAnnotation,
  parseRecipe,
  type AnnotateItem,
  type AnnotationFile,
  type AnnotationObject,
  type ArrowHeads,
  type CaptureRecipe,
  type CursorIcon,
  type RecipeStep,
} from "./schema.js";
export { renderFigure, type RenderFenceOptions, type RenderOptions } from "./render.js";
export { DEFAULT_CURSOR_COLOR, THEME_CSS } from "./theme.js";
