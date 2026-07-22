# MahoManual 仕様書

CMS操作マニュアルをMarkdownで作成し、HTML/PDFで納品するツールの完全仕様。実装手順は [PLAN.md](PLAN.md) を参照。

## 1. 背景と目的

### 旧運用(sample/ 参照)

`sample/manual.md` + `sample/img/` は手作業で作成していたWordPress操作マニュアル。構造は:

- md先頭に印刷用CSS(`.page-break`、画像幅クラス `.img680` / `.img1000`、`@media print`)を埋め込み
- 「見出し → スクショ → ①②③…の説明文」の繰り返し
- スクショには画像編集ソフトでピンク(`#E91E8C` 相当)の**丸数字・強調枠・コの字接続線・矢印**を焼き込み
- `sample/img/1-1.png` のように、縦長画面を**2カラムに分割合成**した画像もある
- ブラウザ印刷でPDF化して納品

### 課題と本ツールの目的

1. 焼き込み注釈は再編集不可(CMS更新のたびに画像を作り直し)→ **注釈をHTML/CSSオーバーレイにして常に再編集可能にする**
2. スクショ撮影・注釈配置が手作業 → **Playwrightレシピで自動化**(DOM座標から注釈位置を自動算出)
3. AI(Claude Code / MCPクライアント)が全操作をできるように、**状態はすべてプレーンテキスト、操作はすべてCLI/コア関数**にする

## 2. アーキテクチャ

```
                 packages/core(全ロジック・純関数中心)
                 ├─ schema.ts    注釈JSON / レシピYAML の zod スキーマ
                 ├─ render.ts    注釈JSON → figure HTML(オーバーレイ展開)
                 ├─ build.ts     manual.md → 納品HTML(テーマCSS埋め込み)
                 ├─ pdf.ts       HTML → PDF(Playwright print-to-PDF)
                 ├─ capture.ts   撮影レシピ実行(Playwright)
                 └─ project.ts   プロジェクト読み書き・renumber等の操作
                        ↑              ↑              ↑
                 packages/app    packages/cli    packages/mcp
                 (GUI・人間用)    (AI・自動化用)   (MCPクライアント用)
```

- **coreに全ロジックを置き、cli / mcp / app は薄いラッパー**にする(二重実装禁止)
- GUIはファイル監視(chokidar + SSE)で、CLI/MCP/AIによるファイル変更を即時反映する

## 3. マニュアルプロジェクト構造

1マニュアル = 1フォルダ。`projects/` 配下に置く。

```
projects/<name>/
├── project.yaml        # プロジェクト設定(任意): title, baseUrl, annotation, output
├── manual.md           # 本文(§5の記法)
├── img/                # 表示用画像(captureの出力先もここ)
│   └── raw/            # 無加工の元スクショ(非破壊クロップの原本)
├── annotations/        # 画像1枚(=1キャンバス)につき1つのJSON(§4)
├── captures/           # 撮影レシピ *.yaml(§9)
├── .auth/              # Playwright storageState(gitignore対象)
└── dist/               # build / pdf の出力先(gitignore対象)
```

`project.yaml`:

```yaml
title: アイケア様求人サイト 更新マニュアル
baseUrl: https://example.com        # レシピの相対URLの基準(任意)
annotation:                         # 注釈テーマの上書き(任意)
  color: "#E91E8C"                  # 全注釈の既定色(--mm-color)
  fontSize: 14                      # badge/text の既定フォントサイズpx(--mm-font-size)
  defaults:                         # 種類別の作成既定値(任意)
    badge: { color: "#E91E8C", size: 22 }
    text: { textAlign: left, verticalAlign: top, padding: 0, borderWidth: 0 }
    frame: { strokeWidth: 2 }
output:                             # GUIからダウンロードする納品ファイル名(任意)
  html: "操作マニュアル.html"
  pdf: "操作マニュアル.pdf"
```

## 4. データモデル(注釈JSON)

`annotations/<id>.json`。zodスキーマは `packages/core/src/schema.ts` に定義する。

### 4.1 座標系(最重要)

| 値 | 単位 | 説明 |
|---|---|---|
| `canvas.width / height` | px | キャンバスの設計座標。アスペクト比の基準・SVGのviewBox。撮影時はCSS px |
| オブジェクトの `rect` / `at` / `points` | %(0-100) | キャンバスに対する相対位置。**範囲制限なし**(キャンバス外への配置を許容、線がはみ出す場合など) |
| `image.crop` | px | **画像ファイルの実ピクセル**(Retina撮影なら2倍解像度のピクセル値)。x,y >= 0(切り抜き専用、負値は不可) |
| `size` / `fontSize` / `strokeWidth` | px | 表示px(バッジ・文字は表示サイズ固定で可読性を維持) |

canvasは画像の配置範囲より大きくてよい。画像の端の外に注釈を置きたい場合はcanvasを拡張して余白を作る(§4.5)。cropのマイナス値で余白を表現することは禁止する。

### 4.2 スキーマ

```ts
type Pct = number;                                    // %(0-100基準、範囲制限なし)
type Rect  = { x: Pct; y: Pct; w: Pct; h: Pct };      // w,h > 0
type Point = { x: Pct; y: Pct };

interface AnnotationFile {
  version: 1;
  canvas: { width: number; height: number };          // px, > 0
  objects: AnnotationObject[];                        // 配列順 = 描画順(後が上)
}

// 全オブジェクト共通
interface Base {
  id: string;                       // ファイル内で一意(重複はバリデーションエラー)
  type: "image" | "badge" | "text" | "cursor" | "frame" | "mosaic" | "line" | "arrow";
  source: "manual" | "recipe";      // recipe由来は再撮影で更新される(§9.4)
  recipeRef?: string;               // source:"recipe" のとき "<レシピID>#<index>"
  locked?: boolean;                 // trueならGUIでの変更・移動・削除を禁止(省略時false)
}

interface ImageObj extends Base {   // キャンバスに複数配置可(2カラム合成等)
  type: "image";
  src: string;                      // プロジェクトルート相対(例 "img/raw/facility-add.png")
  rect: Rect;                       // キャンバス上の配置(%)
  crop?: { x: number; y: number; w: number; h: number };  // 省略時は画像全体。x,y >= 0(余白は§4.5)
}

interface BadgeObj extends Base {   // 丸数字
  type: "badge";
  n: number;                        // 1以上の整数。表示は番号そのまま(①はCSSで円形に描画)
  at: Point;                        // 中心点
  color?: string;                   // 既定 "#E91E8C"(全オブジェクト共通の既定色)
  size?: number;                    // 直径px、既定 22
  fontSize?: number;                // 既定 14(テーマ設定に追従)
}

interface TextObj extends Base {
  type: "text";
  content: string;
  rect?: Rect;                      // テキストボックスの配置・サイズ(新規作成時に使用)
  at: Point;                        // rectの中心。旧形式との互換用アンカー
  fontSize?: number;                // 既定 14
  color?: string;
  background?: string;              // 省略時は背景なし
  textAlign?: "left" | "center" | "right";       // 水平方向
  verticalAlign?: "top" | "middle" | "bottom";   // 垂直方向
  padding?: number;                 // 内側余白px、既定0
  borderColor?: string;             // ボーダー色
  borderWidth?: number;             // ボーダー幅px、既定0
  borderRadius?: number;            // 角丸px、既定0
}

interface CursorObj extends Base { // 操作説明用のマウスカーソル
  type: "cursor";
  icon: "pointer" | "move" | "grab" | "text" | "crosshair";
  at: Point;                        // pointerは先端、その他は中心
  color?: string;                   // 既定 "#000000"
  size?: number;                    // px、既定 28
}

interface FrameObj extends Base {   // 強調枠
  type: "frame";
  rect: Rect;
  color?: string;
  strokeWidth?: number;             // 既定 2
  radius?: number;                  // 既定 0
}

interface MosaicObj extends Base {  // 対象画像の画素へ納品時に適用するモザイク
  type: "mosaic";
  targetImageId: string;            // 同じ注釈内のimageオブジェクトID
  rect: Rect;                       // キャンバス上の適用範囲(%)
  blockSize?: number;               // モザイク1ブロックのキャンバスpx、既定12、2以上
}

interface LineObj extends Base {    // 罫線(折れ線可)
  type: "line";
  points: Point[];                  // 2点以上
  color?: string;
  strokeWidth?: number;             // 既定 2
}

interface ArrowObj extends LineObj { type: "arrow" }   // 終端(最後の点)に矢印
```

`color` は `#RGB` / `#RRGGBB` 形式のみ許可。

### 4.3 実例1: 基本(1枚のスクショ+注釈)

`annotations/1-1.json` — 元画像 `img/raw/facility-add.png`(実ピクセル 1280×1080)の上部をトリミングして使う例:

```json
{
  "version": 1,
  "canvas": { "width": 1280, "height": 960 },
  "objects": [
    {
      "id": "img-main", "type": "image", "source": "manual",
      "src": "img/raw/facility-add.png",
      "rect": { "x": 0, "y": 0, "w": 100, "h": 100 },
      "crop": { "x": 0, "y": 120, "w": 1280, "h": 960 }
    },
    { "id": "b1", "type": "badge", "source": "manual", "n": 1, "at": { "x": 17.3, "y": 16.0 } },
    { "id": "b2", "type": "badge", "source": "manual", "n": 2, "at": { "x": 17.3, "y": 27.1 } },
    { "id": "f1", "type": "frame", "source": "manual", "rect": { "x": 0.3, "y": 18.4, "w": 12.2, "h": 3.0 } },
    {
      "id": "a1", "type": "arrow", "source": "manual",
      "points": [
        { "x": 29.5, "y": 92.0 }, { "x": 62.0, "y": 92.0 },
        { "x": 62.0, "y": 2.0 },  { "x": 82.5, "y": 2.0 }, { "x": 82.5, "y": 6.5 }
      ]
    }
  ]
}
```

### 4.4 実例2: 2カラム合成(sample/img/1-1.png の再現方法)

縦長スクショ1枚(`img/raw/tall-page.png`、実ピクセル 1280×3000)を左右2カラムに分割配置し、接続線で繋ぐ:

```json
{
  "version": 1,
  "canvas": { "width": 1290, "height": 1043 },
  "objects": [
    { "id": "img-left", "type": "image", "source": "manual",
      "src": "img/raw/tall-page.png",
      "rect": { "x": 0, "y": 0, "w": 58.9, "h": 100 },
      "crop": { "x": 0, "y": 0, "w": 760, "h": 1043 } },
    { "id": "img-right", "type": "image", "source": "manual",
      "src": "img/raw/tall-page.png",
      "rect": { "x": 66.7, "y": 0, "w": 33.3, "h": 96.2 },
      "crop": { "x": 810, "y": 1900, "w": 430, "h": 1003 } },
    { "id": "l1", "type": "arrow", "source": "manual",
      "points": [ { "x": 29.5, "y": 94.9 }, { "x": 62.3, "y": 94.9 }, { "x": 62.3, "y": 1.6 }, { "x": 82.8, "y": 1.6 }, { "x": 82.8, "y": 6.2 } ] }
  ]
}
```

### 4.5 キャンバス余白(画像の外側への注釈配置)

画像の端の外に注釈を置きたい場合(例: 画像左端がCMSメニューで、そのさらに左に丸数字を置く)は、**canvasを画像より大きくし、imageのrectをオフセットする**。余白はレイアウトとして表現し、画像画素・cropには含めない(納品PNGにも余白画素は入らない)。

左に320pxの余白を作る例(元: canvas 1280×960 に全面配置):

```json
{
  "version": 1,
  "canvas": { "width": 1600, "height": 960 },
  "objects": [
    { "id": "img-main", "type": "image", "source": "manual",
      "src": "img/raw/menu.png",
      "rect": { "x": 20, "y": 0, "w": 80, "h": 100 } },
    { "id": "b1", "type": "badge", "source": "manual", "n": 1, "at": { "x": 10, "y": 16 } }
  ]
}
```

canvas寸法が変わると既存オブジェクトの%座標が指す位置がズレるため、余白の追加・削除は必ず `expandCanvas(annotation, margin)`(core純関数)で行う。canvasを拡張し、全オブジェクトの%座標・rect・pointsを再計算して見た目上の位置を維持する(crop・size・fontSize等のpx値は不変)。GUI(§11)、MCPの `expand_canvas`(§10)、レシピの `screenshot.margin`(§9.1)はすべてこの関数を使う。

- margin: `{ top?, right?, bottom?, left? }`、単位はCSS px(canvas座標)
- 負値は余白の削除(縮小)。結果のcanvas寸法が0以下になる場合はエラー

## 5. Markdown記法

`manual.md` は通常のMarkdown(GFM対応。パイプテーブル等を含む)。生HTMLも許可(rehype-raw)。注釈付き画像は専用コードフェンスで参照する:

````md
## 1 施設情報カテゴリーの追加

```annotated-image
src: 1-1          # annotations/1-1.json を参照(必須)
width: 1000       # figureのmax-width px(任意、既定 1000)
border: true      # 1px #999 の外枠(任意、既定 false)
alt: 施設情報の追加画面   # 任意
caption: ""       # 任意。figcaptionとして出力
```

左メニューの求人情報 > 施設情報から追加できます。

①施設名を入力。

②URLを入力。
````

- フェンス本文はYAML。ビルド時に §6 のfigure HTMLへ展開される
- 本文中の丸数字(①②…)は sample/ と同じくUnicode文字をそのまま書く(著者の慣習であり、ツールは変換しない)
- 見出しには rehype-slug でid付与(github-slugger。日本語見出しは `#1-施設情報カテゴリーの追加` 形式になり、sampleの手書きTOCリンクと互換)
- 目次: 単独行の `<!-- toc -->` を H2 のみのリンク一覧(`<nav class="mm-toc">`)へ展開する。マーカーが無い場合は目次を出力しない。リンク先 slug は rehype-slug と同じ github-slugger 採番

## 6. レンダリング仕様(注釈JSON → figure HTML)

### 6.1 出力構造(§4.3 の実例に対応)

```html
<figure class="mm mm-print-l mm-border" style="max-width:1000px; aspect-ratio:1280/960;">
  <div class="mm-obj mm-image" style="left:0%; top:0%; width:100%; height:100%;">
    <img src="img/raw/facility-add.png" alt=""
         style="width:100%; height:112.5%; left:0%; top:-12.5%;">
  </div>
  <span class="mm-obj mm-badge" style="left:17.3%; top:16%;">1</span>
  <span class="mm-obj mm-badge" style="left:17.3%; top:27.1%;">2</span>
  <span class="mm-obj mm-frame" style="left:0.3%; top:18.4%; width:12.2%; height:3%;"></span>
  <svg class="mm-lines" viewBox="0 0 1280 960" preserveAspectRatio="none">
    <defs>
      <marker id="mm-arrow-a1" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12"
              refX="9" refY="6" orient="auto">
        <path d="M0,0 L12,6 L0,12 z" fill="#E91E8C"/>
      </marker>
    </defs>
    <polyline points="377.6,883.2 793.6,883.2 793.6,19.2 1056,19.2 1056,62.4"
              fill="none" stroke="#E91E8C" stroke-width="2" marker-end="url(#mm-arrow-a1)"/>
  </svg>
  <figcaption>…(captionがある場合のみ)</figcaption>
</figure>
```

### 6.2 レンダリング規則

- figure: `position:relative`、`aspect-ratio: canvas.width / canvas.height`、`max-width` はフェンスの `width`。`width ≤ 680` なら `mm-print-s`、それ以外は `mm-print-l` クラスを付与(印刷時の縮小率切替、§6.4)
- **badge**: `left/top` = `at` の%値、`transform: translate(-50%,-50%)` で中心合わせ。サイズ・フォントはpx固定(縮小表示でも可読性維持)。badgeの表示は `n` の数値をCSSで円形に描画(Unicode①は使わない)
- **text**: `rect` がある場合は `left/top/width/height` を%値で指定する矩形テキストボックスとして描画し、内容は改行・長い単語を折り返す。`textAlign`・`verticalAlign`・`padding`・ボーダー指定はテキストボックス内へ適用する。`rect` がない旧JSONは `at` を中心とするアンカー表示へフォールバックする。GUIの選択・リサイズ・ダブルクリック編集はこの矩形を対象にする
- **cursor**: Lucide相当のアイコンを外部ファイルやWebフォントへ依存しないinline SVGで描画する。`pointer`は`at`を矢印の先端、その他は中心として配置し、単一HTML出力にもSVGパスを直接含める
- **frame**: `left/top/width/height` = `rect` の%値。`border: {strokeWidth}px solid {color}`、`box-sizing:border-box`
- **line / arrow**: figure全面に重ねた1つの `<svg>` にまとめる。`viewBox="0 0 {canvas.width} {canvas.height}"`。点は%→キャンバスpxに変換(`x_px = x / 100 * canvas.width`)。figureのaspect-ratioとviewBoxが一致するためスケーリングは常に等倍比(歪みなし)。**strokeWidthはviewBox座標系のpxで指定し、図全体と比例スケール**(vector-effectは使わない。矢印マーカーとの太さ整合のため)。arrowは `marker-end`(オブジェクトごとに一意のmarker idを生成)
- **image(編集時は非破壊クロップ)**: GUIプレビューではラッパーdivを `rect` に絶対配置し `overflow:hidden`。内部imgは crop領域がラッパーを満たすよう絶対配置:

```
naturalW/H = 画像ファイルの実ピクセル(ビルド時に image-size 等で取得)
img.width  = naturalW / crop.w * 100 %      (ラッパー基準)
img.height = naturalH / crop.h * 100 %
img.left   = -crop.x / crop.w * 100 %
img.top    = -crop.y / crop.h * 100 %
```

例(§4.3): naturalH=1080, crop.h=960, crop.y=120 → height=112.5%, top=-12.5%(§6.1と一致)

- **納品時の実クロップ**: `build` は各imageオブジェクトのcrop範囲を `dist/img/cropped/<annotationId>/<objectId>.png` としてPNG出力し、納品HTMLはこの画像を参照する。クロップ範囲外の画素を含む元画像は、同時に本文から参照されない限り`dist`から除去する。`--single-file` とPDFもこの実クロップ済み画像を使う。

- レンダラーは純関数にする: `renderFigure(annotation, opts)` は画像の実サイズを `opts.naturalSizes: Record<src, {w,h}>` として受け取り、ファイルI/Oをしない(テスト容易性のため)。実サイズの解決はbuild側の責務

### 6.3 テーマCSS(納品HTMLに埋め込み)

```css
body { font-family: -apple-system, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif;
       line-height: 1.8; color: #222; max-width: 1080px; margin: auto; padding: 40px 24px; }
/* 見出し・段落余白は UA 既定相当を明示(プレビューの Preflight 対策含む) */
h1 { font-size: 2em; font-weight: bold; margin: 0.67em 0; }
h2 { font-size: 1.5em; font-weight: bold; margin: 0.83em 0; }
/* …h3〜h6、p/ul/ol/blockquote も同様に余白を明示 */
table { border-collapse: collapse; margin: 1em 0; width: 100%; }
th, td { border: 1px solid #666; padding: 0.4em 0.75em; text-align: left; vertical-align: top; }
th { background: #f5f5f5; font-weight: bold; }
.mm { position: relative; width: 100%; margin: 0; }
/* …figure 系は THEME_FIGURE_CSS 参照 */
hr { margin: 60px 0; border: 0; border-bottom: 1px solid #666; }
.page-break { page-break-before: always; }
@media print {
  body { font-size: 12px; }
  .mm-print-s { max-width: 60% !important; }
  .mm-print-l { max-width: 80% !important; }
  hr.page-break { border-bottom: 0; margin: 0; }
}
```

(badge/frame等の色・サイズは既定値をCSSに置き、オブジェクト指定があるときのみinline styleで上書き。GUIプレビューは `THEME_TYPOGRAPHY_CSS` を `.preview-pane` スコープで注入し納品HTMLと余白・表罫線を揃える)

## 7. 出力仕様

### build(納品HTML)

- 入力: プロジェクトフォルダ → 出力: `dist/manual.html` + `dist/img/`。注釈付き画像は `dist/img/cropped/` に実クロップして出力し、クロップ外の画素を納品物へ含めない。通常Markdownの画像はそのままコピーする
- 完全なスタンドアロンHTML(`<!doctype html>`、`<title>` は最初のh1、テーマCSSは `<style>` 埋め込み)
- `--single-file`: 画像をbase64 data URIでインライン化した単一HTML(imgフォルダ不要で納品可能)

### pdf

- buildしたHTMLをPlaywright(Chromium)で開き `page.pdf()`
- 既定: A4縦、`printBackground: true`、margin 12mm、出力 `dist/manual.pdf`
- `.page-break` / `@media print` がそのまま効く

## 8. CLI仕様(packages/cli、binは `manual`)

| コマンド | 動作 |
|---|---|
| `manual new <name>` | `projects/<name>/` を§3構造で雛形生成(manual.mdテンプレート付き) |
| `manual build <project> [--single-file] [-o <dir>]` | 納品HTML生成。既定出力 `dist/` |
| `manual pdf <project> [-o <file>]` | build後にPDF生成。既定 `dist/manual.pdf` |
| `manual login <project> --url <URL>` | headedブラウザを開く。人間がログイン後ブラウザを閉じると `.auth/state.json` にstorageState保存 |
| `manual capture <project> [<recipeId>] [--all]` | 撮影レシピ実行(§9)。recipeId省略+`--all`で全レシピ |
| `manual renumber <project> <annotationId>` | badgeの `n` を配列順で1から振り直し |

- `<project>` はパスまたは `projects/` 配下の名前
- 終了コード: 成功0 / 失敗1(zodバリデーションエラーは対象ファイル名と全issueを日本語で表示)

## 9. 撮影レシピ仕様(captures/*.yaml)

### 9.1 スキーマと例

```yaml
# captures/1-1.yaml(ファイル名 = レシピID = 出力ID)
title: 施設情報の追加
url: /wp-admin/edit-tags.php?taxonomy=facility   # 絶対URL可。相対はproject.yamlのbaseUrl基準
viewport: { width: 1280, height: 900 }
steps:                          # 任意。撮影前の操作(上から順に実行)
  - waitFor: "#addtag"          # 要素の出現を待つ
  - click: "#some-button"      # クリック
  - hover: ".menu-item"        # ホバー
  - fill: { selector: "#tag-name", value: "アイケアハウス小樽" }  # 入力
screenshot:
  target: fullPage              # fullPage | selector(CSSセレクタ文字列)| clip {x,y,w,h}
  margin: { left: 60 }          # 任意。撮影領域の外側に確保する余白CSS px(top/right/bottom/left、§4.5)
output: "1-1"                   # img/1-1.png と annotations/1-1.json を生成/更新
annotate:                       # 任意。上から順にbadgeは自動採番(1,2,…)
  - type: badge
    selector: "#tag-name"
  - type: badge
    selector: "#tag-slug"
  - type: frame
    selector: "#menu-posts .current"
    padding: 4                  # 要素boxの外側余白px(任意、既定4)
```

### 9.2 実行フロー(`manual capture`)

1. `.auth/state.json` があればstorageStateとして読み込み、Chromium起動(`deviceScaleFactor: 2` で高解像度撮影)
2. URLへ遷移 → steps実行 → スクショを `img/raw/<output>.png` に保存
3. 撮影領域(fullPage=ページ全体 / selector・clip=その矩形)を基準に、各annotate対象の `boundingBox()`(CSS px)を%へ変換:
   `x% = (box.x - region.x) / region.width * 100`
4. `annotations/<output>.json` を生成/マージ(§9.4)。canvasは撮影領域のCSS px寸法。imageオブジェクトのcropは実ピクセル(CSS pxの2倍)で全領域を指定。`screenshot.margin` 指定時は生成結果に `expandCanvas`(§4.5)を適用してからマージする(canvas=領域+余白、rect・注釈%座標は余白込みで再計算。スクショ自体は領域のみで余白画素を含まない)
5. 表示用 `img/<output>.png` は raw のコピー(GUIでクロップ変更してもrawが原本)

### 9.3 注釈の自動配置規則

- badge: 対象要素の**左端中央**から左に16px(CSS px)オフセットした点。レシピで `anchor: left|right|top|bottom|center` と `offset: {dx,dy}` を上書き可
- frame: 要素boxを `padding` px 外側に広げた矩形
- 生成オブジェクトは `source: "recipe"`、`recipeRef: "<レシピID>#<annotate配列のindex>"`、idは `"<レシピID>-r<index>"`

### 9.4 再撮影時のマージ規則(重要)

既存の `annotations/<output>.json` がある場合:

1. `source: "recipe"` かつ `recipeRef` が当該レシピのオブジェクト → **新しい撮影結果で置き換え**(レシピから消えたindexは削除)
2. `source: "manual"` のオブジェクト → **位置・内容そのまま保持**
3. 既存ファイルがなければ新規作成

→ 「CMS更新後に `manual capture --all` で全スクショ+レシピ由来の注釈を一括再生成、手動調整分は温存」を実現する。

### 9.5 うまくいかないときの逃げ道

レシピ化が困難なページは、手動スクショを `img/raw/` に置いて注釈をGUI/AIで付ければよい(撮影エンジンは他機能から疎結合)。

## 10. MCPサーバー仕様(packages/mcp)

`@modelcontextprotocol/sdk` のstdioサーバー。サーバー名 `MahoManual`。全ツールはcore関数の薄いラッパーで、エラー時はzodのissueを含む日本語メッセージを返す。

| ツール | 引数 | 動作 |
|---|---|---|
| `list_manuals` | なし | projects/ 配下の一覧(name, title, ページ・画像数) |
| `read_manual` | project | manual.md本文とannotations/capturesの一覧 |
| `read_annotation` | project, id | 注釈JSONの取得 |
| `add_annotation` | project, id, object | オブジェクト追加(スキーマ検証) |
| `update_annotation` | project, id, objectId, patch | オブジェクト部分更新 |
| `remove_annotation` | project, id, objectId | オブジェクト削除 |
| `set_crop` | project, id, objectId, crop | imageオブジェクトのcrop変更 |
| `expand_canvas` | project, id, margin | キャンバス余白の追加・削除(§4.5。canvas拡張+全オブジェクトの%座標再計算) |
| `renumber_badges` | project, id | badge採番の振り直し |
| `build_html` | project, singleFile? | 納品HTML生成、出力パスを返す |
| `export_pdf` | project | PDF生成、出力パスを返す |
| `run_capture` | project, recipeId?(省略で全件) | レシピ実行、結果サマリを返す |

クライアント設定例(`.mcp.json` / Claude Desktop):

```json
{ "mcpServers": { "MahoManual": {
    "command": "node",
    "args": ["<絶対パス>/packages/mcp/dist/index.js"] } } }
```

## 11. GUI仕様(packages/app、Phase 4〜5)

- Vite + React + Tailwind CSS v4(`@tailwindcss/vite`、tailwind.configは使わない)+ Hono(ファイルAPI)
- プロジェクト一覧: ID・タイトルを指定してSPEC §3の標準構造を新規作成し、作成後はプロジェクトページへ遷移する。既存IDと不正なパスは拒否する
- プロジェクトページ / マニュアル編集ページ: 画像をbase64埋め込みした単一HTMLと、A4・背景印刷有効のPDFをGUIからダウンロードできる
- **編集画面のfigure DOMは §6 の出力HTMLと同一構造**(coreのレンダラーをそのままブラウザで使う)。これがWYSIWYG一致の核
- 注釈エディタ: オブジェクトパレット(badge/text/cursor/frame/line/arrow)、ドラッグ・リサイズ、クロップUI、Deleteキー削除、%座標への変換はcanvas基準
- 複数画像: 既存キャンバスへ画像を追加し、画像オブジェクトをドラッグ・リサイズして横並び・重ね合わせできる。追加画像は縦横比を維持してキャンバス中央へ収まる初期配置とする
- オブジェクトロック: オブジェクト単位の `locked` を一覧の鍵ボタンで切り替える。ロック中はドラッグ・リサイズ・数値変更・クロップ・置換・レイヤー移動・削除を禁止し、選択と内容確認のみ許可する。新規のベース画像・レシピ画像はロック、追加画像は配置調整のためロック解除を既定とする
- テキストボックス: テキストツールのクリックで幅・高さを持つ矩形ボックスを作成し、矩形の左上をクリック座標に合わせる。選択中は右パネルで矩形のx/y/w/h(%)、文字揃え、内側余白、ボーダーを編集できる。「内容に合わせて高さを調整」はブラウザ上の実測値を具体的な`rect.h`へ確定する。キャンバス上のダブルクリックで同じボックス内を直接編集し、クリック位置へキャレットを移動できる。Cmd/Ctrl+Enterまたはフォーカスアウトで確定、Escで取消する
- 通知・競合バナー: 編集画面の通知と競合解決UIはキャンバス表示領域へ重ねて表示し、通知の表示・非表示でキャンバスのviewport寸法を変更しない
- モザイク: `targetImageId` で対象画像を明示し、矩形範囲と粗さを非破壊データとして保持する。編集画面では効果をプレビューし、HTML/PDF/合成PNG出力時はSharpで対象画素を縮小・最近傍拡大して画像へ実適用する。納品物には対象範囲の未加工画素を含む画像を残さない
- キャンバス余白: 上下左右のpx指定でcanvasを拡張/縮小(coreの `expandCanvas`)。既存注釈の見た目位置は維持され、画像の外側へ注釈を置けるようになる(§4.5)
- Undo / Redo: GUI内の注釈編集履歴を最大100件保持。`Cmd/Ctrl+Z`でUndo、`Cmd/Ctrl+Shift+Z`または`Ctrl+Y`でRedo。外部変更の読込・別注釈への遷移時は履歴をリセットする
- 合成画像出力: 保存済みの画像と全注釈オブジェクトをcoreレンダラーで合成し、canvasと同じピクセル寸法のPNGとしてダウンロード。画像srcはdata URL化し、Playwrightでfigureのみをキャプチャする
- スクショ取り込み: クリップボードペースト(Clipboard API)→ `img/raw/` へ保存 → 注釈JSON雛形生成
- ライブリロード: サーバーがchokidarでプロジェクトを監視し、SSEでクライアントへ通知(AI/CLIによるファイル変更が開いている画面に即反映)
- Phase 5: CodeMirror 6のmdエディタ+プレビュー(左右分割)、プレビュー内figureクリックで注釈エディタへ、renumber結果と本文①②…の整合チェック表示
- マニュアル編集: カーソル位置へ `<!-- toc -->` または `annotated-image` フェンスを挿入できる(既存注釈の参照、または新規画像取り込み)
- Phase 10-2: ビジュアルクロップ、矩形選択、整列・等間隔、スマートガイド(6画面px)、Alt+ドラッグ複製、`[`/`]`でレイヤー移動
- Phase 10-3: `annotation.defaults` と localStorage 直近スタイル、選択中スタイルの種類別既定への保存・解除、⌘⌥C/V スタイルコピー、一覧の一時非表示・単独表示、前後注釈移動と未保存移動バナー、テキストのインライン編集
- Phase 10-4: 矢印キー移動の履歴統合(250ms)、外部変更時の3-wayマージとオブジェクト単位競合解決UI
- Phase 10-5: テキストオブジェクトを矩形テキストボックスへ移行し、矩形の選択・リサイズ・キャンバス上ダブルクリック編集を追加。配置アンカー、キャレット操作、通知オーバーレイの回帰修正を含む

## 12. 決定事項の要約(迷ったらここ)

- 状態はすべてプレーンテキスト。DBなし。Git管理前提
- 元画像は無加工保持、クロップ・注釈は常に非破壊(データで表現)
- 個人情報を隠すモザイクはプロジェクト内では非破壊、納品画像では画素へ実適用し、CSSオーバーレイだけに依存しない
- 座標は%、キャンバスとcropはpx(§4.1)
- 画像の外への注釈はキャンバス余白で表現(§4.5)。cropは純粋な切り抜き(x,y >= 0、負値による余白は不可)
- 既定色 `#E91E8C`、badge直径22px、strokeWidth 2px。既定はテーマCSSのカスタムプロパティ(--mm-color / --mm-font-size)が持ち、project.yaml の `annotation:` で上書き可
- 利用者は1人。認証・マルチユーザー機能は作らない(YAGNI)
- coreが唯一のロジック置き場。cli/mcp/appに業務ロジックを書かない
