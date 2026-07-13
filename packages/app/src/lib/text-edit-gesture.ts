export interface TextPointerClickMemory {
  id: string;
  timestamp: number;
}

const TEXT_EDIT_DOUBLE_CLICK_MS = 500;

/**
 * テキスト上の pointerdown が「編集開始」かを判定する。
 * ドラッグ開始で click が消えても、2回目の pointerdown をダブルクリック相当にできる。
 */
export function classifyTextPointerDown(
  memory: TextPointerClickMemory | null,
  objectId: string,
  timestamp: number,
): { openEdit: boolean } {
  return {
    openEdit: !!(
      memory
      && memory.id === objectId
      && timestamp - memory.timestamp < TEXT_EDIT_DOUBLE_CLICK_MS
    ),
  };
}

export function rememberTextPointerClick(
  objectId: string,
  timestamp: number,
): TextPointerClickMemory {
  return { id: objectId, timestamp };
}
