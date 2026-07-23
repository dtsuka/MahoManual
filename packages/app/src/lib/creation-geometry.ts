import { snapAngle, type PointPct } from "./geometry.js";

// オブジェクト生成・ドラッグ操作で共有する定数とユーティリティ。
// 表示倍率により1画面pxが0.1%以上になる場合も、クリック位置を安定した値へ揃える。
export const roundCreationPct = (value: number): number => Math.round(value * 2) / 2;

// 点ドラッグ時に他の点の x/y へ吸着する距離(%)。
// 解除距離を大きくする(ヒステリシス)ことで吸着⇄解除のフリッカーを防ぐ
export const SNAP_THRESHOLD_PCT = 0.7;
export const SNAP_RELEASE_PCT = 1.5;

export interface ResolveLineDraftPointOptions {
  /** Shift 押下中は直前の点を基準に 45° 刻みへスナップする */
  shiftKey: boolean;
  /** クリック確定時は true。ホバープレビューは false のまま滑らかに追従させる */
  round?: boolean;
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
    options.shiftKey && previous ? snapAngle(point, previous) : point;
  if (options.round === false) {
    return snapped;
  }
  return {
    x: roundCreationPct(snapped.x),
    y: roundCreationPct(snapped.y),
  };
}
