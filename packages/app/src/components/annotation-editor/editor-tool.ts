export type CreationTool = "badge" | "text" | "cursor" | "frame" | "mosaic" | "line" | "arrow";
export type EditorTool = "select" | CreationTool;
export type RectCreationTool = Extract<CreationTool, "frame" | "mosaic">;

export function isRectCreationTool(tool: EditorTool): tool is RectCreationTool {
  return tool === "frame" || tool === "mosaic";
}

/** badge ツール中に、既に配置済みの badge をドラッグ編集している */
export function isEditingPlacedBadge(
  tool: EditorTool,
  targetId: string | undefined,
  selectedIds: readonly string[],
): boolean {
  return tool === "badge" && targetId !== undefined && selectedIds.includes(targetId);
}

/** figure 上で既存オブジェクトの選択・ドラッグを許可するか */
export function allowsObjectDrag(
  tool: EditorTool,
  targetId: string | undefined,
  selectedIds: readonly string[],
): boolean {
  return tool === "select" || isEditingPlacedBadge(tool, targetId, selectedIds);
}
