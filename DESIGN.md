# DESIGN.md — MahoManual GUI

GUIエディタ(packages/app)の視覚システム。戦略的な背景は [PRODUCT.md](PRODUCT.md) を参照。

## Theme

- **Register**: product(道具のUI。デザインは作業に奉仕する)
- **Color strategy**: Restrained — 寒色ニュートラル + 青アクセント(操作・選択のみ)
- ライトテーマ固定(スクショ=白いCMS画面が主役のため、クロームは明るい寒色で退く)

## Colors

| 役割 | 値 | 用途 |
|---|---|---|
| ページ背景 | `slate-50` (#f8fafc) | body |
| キャンバス | `#eef1f6` + ドットグリッド | 注釈エディタの作業面(`.editor-canvas`) |
| サーフェス | `white` | ヘッダ・カード・パネル |
| 罫線 | `slate-200` / `slate-300` | 区切り / フォーム部品の枠 |
| 本文 | `slate-900` (#0f172a) | 主要テキスト |
| 補助テキスト | `slate-500`〜`600` | ラベル・ヒント(コントラスト 4.5:1 以上を維持) |
| アクセント | `blue-600` (#2563eb) | 主ボタン・選択状態・フォーカス。キャンバス上の選択表示と統一 |
| ブランド | `--color-brand` #E91E8C | ロゴ(BrandMark)・ファビコン・注釈の既定色のみ。UI操作には使わない |
| 状態色 | emerald / amber / red | 成功 / 警告・未保存 / エラー(Banner・DirtyBadge) |

**鉄則**: マゼンタはキャンバス上の注釈オブジェクトの色。UIの選択・操作は青系に分離し、混同させない。

## Typography

- 1ファミリーのみ: システムスタック(SF Pro / Hiragino Sans / Noto Sans JP)。`--font-sans` で定義
- コード・ID・Markdownエディタ: `--font-mono`(SF Mono系 + Hiragino フォールバック)
- スケール(固定rem): 見出し `text-xl font-bold` → 画面タイトル `text-[15px] font-semibold` → 本文 `text-sm`/`text-[13px]` → ラベル `text-xs font-medium` → キャプション `text-[11px]`
- 全角UIのため letter-spacing はいじらない(tracking-tight は見出しのみ)

## Components(packages/app/src/components/ui.tsx)

すべてのボタン・入力はここを通す。直書き禁止。

- **Button**: `primary`(blue-600 / 保存など各画面1つ) ・ `secondary`(白+枠 / 通常操作) ・ `ghost`(ツールバー・軽い操作)。サイズ `sm`(h-7)/`md`(h-8)
- **ButtonLink**: `<a>` 用の同スキン(ダウンロード系)
- **IconButton**: 正方形 ghost + `aria-label` 必須(戻る・Undo/Redo・ツールレール)
- **TextInput / SelectInput**: 共通 `CONTROL_BASE`(focus: border-blue-400 + ring-blue-500/20)。select は `.ui-select` のシェブロン
- **NumberField**(AnnotationEditor内): Figma風 — 枠内に接頭ラベル(x/y/w/h)+ 枠なし input、`focus-within` リング
- **Banner**: success / warning / danger。アイコン付き全幅ストリップ(状態通知・外部変更確認)
- **DirtyBadge**: 未保存 = amber ピル+ドット(文言「未保存」はe2e依存で固定)
- **Card / EmptyState / Kbd / Separator / BrandMark**

アイコンは icons.tsx の手書き16pxストローク(1.5px, currentColor)のみ。外部アイコン集は導入しない。

## Layout

- **プロジェクト一覧**: 中央 max-w-2xl 単カラム。ブランドヘッダ → 追加フォーム → カードリスト(スケルトン・空状態あり)
- **プロジェクトホーム**: 白ヘッダ(パンくず+書き出し)→ max-w-3xl(主導線カード → ドロップゾーン → 注釈一覧)
- **マニュアル編集**: ヘッダツールバー(挿入系 | 書き出し系 | 保存 をSeparatorで群化)+ 2分割(左: CodeMirror、右: グレー机上に白い「ページ」= 納品物メタファ)
- **注釈エディタ**: ヘッダ(ナビ+文書操作)/ 左フロートのツールレール(オブジェクト追加)/ ドットグリッドキャンバス(figureに ring+shadow)/ 右 w-80 白パネル(オブジェクト一覧 → プロパティ → ショートカット凡例)

## Interaction & Motion

- transition-colors 150ms のみ。装飾モーションなし。`prefers-reduced-motion` で全停止
- フォーカス: フォーム部品は border+ring、それ以外は `:focus-visible` の2pxアウトライン(index.css)
- ローディングはスケルトン(一覧)/ 控えめなスピナー+文言(取り込み中)

## 変更時の注意(e2e依存)

- data-testid はすべて維持する
- テキスト依存: ボタン名「戻る」(aria-label可)、「未保存」、「画像を置換しました」、h1「{project} / {id}」
- クラス依存: 選択中オブジェクト行に `border-blue-400`、選択中の点行に `bg-blue-100` を含めること
- キャンバス操作CSS(`.mm-editor-*`)はハンドル寸法・ヒット領域を変えない
