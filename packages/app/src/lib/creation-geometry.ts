import { snapThresholdPct } from "@mahomanual/core/object-geometry";
import { snapAngle, type PointPct } from "./geometry.js";

// オブジェクト生成・ドラッグ操作で共有する定数とユーティリティ。
// 表示倍率により1画面pxが0.1%以上になる場合も、クリック位置を安定した値へ揃える。
export const roundCreationPct = (value: number): number => Math.round(value * 2) / 2;

// 点ドラッグ時に他の点の x/y へ吸着する距離(%)。
// 解除距離を大きくする(ヒステリシス)ことで吸着⇄解除のフリッカーを防ぐ
export const SNAP_THRESHOLD_PCT = 0.7;
export const SNAP_RELEASE_PCT = 1.5;

/**
 * スマートガイドの吸着距離(画面6px)を%に換算する。
 * %はキャンバスの設計幅に対する値なので、画面上の figure 幅ではなく canvas.width を使う
 * (表示倍率は snapThresholdPct 側で反映する)。
 */
export function snapThresholdForCanvas(
  zoomPercent: number,
  canvas: { width: number; height: number },
  thresholdScreenPx = 6,
): number {
  return snapThresholdPct(zoomPercent, canvas.width, thresholdScreenPx);
}

export interface ResolveLineDraftPointOptions {
  /** Shift 押下中は直前の点を基準に 45° 刻みへスナップする */
  shiftKey: boolean;
  /** クリック確定時は true。ホバープレビューは false のまま滑らかに追従させる */
  round?: boolean;
  /** 角度を見た目どおりに揃えるためのキャンバス寸法(px) */
  canvas?: { width: number; height: number };
}

/**
 * 罫線・矢印の作成中に置く次の点を解決する。
 * 直前の点があり Shift 中なら角度スナップし、必要なら 0.5% 刻みへ丸める。
 */
export function resolveLineDraftPoint(
  point: PointPct,
  previous: PointPct | undefined,
  options: ResolveLineDraftPointOptions,
): PointPct {
  const snapped =
    options.shiftKey && previous ? snapAngle(point, previous, options.canvas) : point;
  if (options.round === false) {
    return snapped;
  }
  return {
    x: roundCreationPct(snapped.x),
    y: roundCreationPct(snapped.y),
  };
}
