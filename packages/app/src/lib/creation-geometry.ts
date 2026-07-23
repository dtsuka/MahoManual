// オブジェクト生成・ドラッグ操作で共有する定数とユーティリティ。
// 表示倍率により1画面pxが0.1%以上になる場合も、クリック位置を安定した値へ揃える。
export const roundCreationPct = (value: number): number => Math.round(value * 2) / 2;

// 点ドラッグ時に他の点の x/y へ吸着する距離(%)。
// 解除距離を大きくする(ヒステリシス)ことで吸着⇄解除のフリッカーを防ぐ
export const SNAP_THRESHOLD_PCT = 0.7;
export const SNAP_RELEASE_PCT = 1.5;
