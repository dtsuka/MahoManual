export interface CanvasEventLike {
  clientX: number;
  clientY: number;
  target: EventTarget | null;
}

export interface CanvasObjectTargets {
  direct: HTMLElement | null;
  point: HTMLElement | null;
}

const POINT_OBJECT_SELECTOR = ".mm-badge, .mm-text, .mm-cursor";

function isDomElement(value: EventTarget | null): value is Element {
  return !!value && typeof (value as Element).closest === "function";
}

/**
 * キャンバス上のヒット対象を解決する。
 * 透明フレームの下にある点オブジェクトは elementsFromPoint で拾い直す。
 */
export function resolveCanvasObjectTargets(
  event: CanvasEventLike,
  elementsFromPoint: (x: number, y: number) => Element[] = (x, y) =>
    document.elementsFromPoint(x, y),
): CanvasObjectTargets {
  if (!isDomElement(event.target)) {
    return { direct: null, point: null };
  }
  const directTarget = event.target.closest<HTMLElement>("[data-mm-id]");
  if (!directTarget) {
    return { direct: null, point: null };
  }
  if (!directTarget.classList.contains("mm-frame")) {
    return {
      direct: directTarget,
      point: directTarget.matches(POINT_OBJECT_SELECTOR) ? directTarget : null,
    };
  }

  const pointTarget = elementsFromPoint(event.clientX, event.clientY)
    .map((element) => element.closest<HTMLElement>("[data-mm-id]"))
    .find((element) => element?.matches(POINT_OBJECT_SELECTOR)) ?? null;
  return { direct: directTarget, point: pointTarget };
}

export function resolveCanvasObjectElement(
  event: CanvasEventLike,
  elementsFromPoint?: (x: number, y: number) => Element[],
): HTMLElement | null {
  const { direct, point } = resolveCanvasObjectTargets(event, elementsFromPoint);
  return point ?? direct;
}

export type SelectPointerGesture =
  | { kind: "none" }
  | { kind: "drag"; objectId: string }
  | {
      /** 透明フレーム下の未選択の点: move=フレームドラッグ、!moved=点選択 */
      kind: "frame-over-point";
      frameId: string;
      pointId: string;
    };

/**
 * select モードのポインタジェスチャを分類する。
 * フレーム+点の重なりはドラッグ=フレーム、クリック=点 に遅延解決する。
 */
export function classifySelectPointerGesture(
  targets: CanvasObjectTargets,
  options: {
    isSelectMode: boolean;
    isEditableFrame: (objectId: string) => boolean;
    isSelectedPoint?: (objectId: string) => boolean;
  },
): SelectPointerGesture {
  const frameId = targets.direct?.classList.contains("mm-frame")
    ? targets.direct.dataset.mmId
    : undefined;
  const pointId = targets.point?.dataset.mmId;

  if (pointId && options.isSelectedPoint?.(pointId)) {
    return { kind: "drag", objectId: pointId };
  }

  if (
    options.isSelectMode
    && frameId
    && pointId
    && options.isEditableFrame(frameId)
  ) {
    return { kind: "frame-over-point", frameId, pointId };
  }

  const preferred = targets.point ?? targets.direct;
  const objectId = preferred?.dataset.mmId;
  if (!objectId) {
    return { kind: "none" };
  }
  return { kind: "drag", objectId };
}
