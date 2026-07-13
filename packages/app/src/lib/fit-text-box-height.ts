/**
 * figure 内のテキスト要素を一時クローンして内容高さ(% )を測る。
 * DOM 計測だけを担い、注釈の更新は呼び出し側が行う。
 */
export function measureTextBoxContentHeightPct(
  figure: Element,
  objectId: string,
): number | null {
  const textElement = Array.from(figure.querySelectorAll<HTMLElement>(".mm-text"))
    .find((element) => element.dataset.mmId === objectId);
  const figureBox = figure.getBoundingClientRect();
  if (!textElement || figureBox.height <= 0) {
    return null;
  }

  const probe = textElement.cloneNode(true) as HTMLElement;
  probe.style.left = "0%";
  probe.style.top = "0%";
  probe.style.height = "auto";
  probe.style.minHeight = "0";
  probe.style.maxHeight = "none";
  probe.style.transform = "none";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  figure.appendChild(probe);
  const measuredHeight = probe.getBoundingClientRect().height;
  probe.remove();
  if (!Number.isFinite(measuredHeight) || measuredHeight <= 0) {
    return null;
  }
  return Math.max(0.5, Math.round((measuredHeight / figureBox.height) * 1000) / 10);
}
