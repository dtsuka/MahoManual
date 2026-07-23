# MahoManual 実装手順書

[SPEC.md](SPEC.md) の仕様を、以下のPhase順で実装する。**上から順に進め、完了したステップのチェックボックスを `[x]` に更新してコミットに含めること。**

## 全ステップ共通の進め方(TDDサイクル)

1. ステップに書かれたテストを先に書く(実装コードは書かない)
2. テストを実行し、**失敗することを確認**する
3. `test: <内容>` でコミット
4. 実装する(テストは変更しない。テストが誤っていた場合のみ理由をコミットメッセージに明記して修正)
5. テストがパスしたら `feat: <内容>` でコミット
6. このファイルのチェックボックスを更新

- コミットprefix: feat / fix / docs / style / refactor / perf / test / chore
- テストタイムアウトは1〜3秒目安(Playwrightを使うe2eのみ適宜延長可、上限30秒)

---

## Phase 0 — リポジトリ初期化

- [x] `git init` し、既存ファイル(CLAUDE.md, docs/, sample/)を初回コミット
- [x] pnpm workspace構築: ルート `package.json`(private, `"type": "module"`, engines node>=20)、`pnpm-workspace.yaml`(packages/*)
- [x] `.gitignore`: `node_modules/`, `dist/`, `**/.auth/`, `.DS_Store`, `projects/*/dist/`
- [x] `packages/core` 雛形: TypeScript(strict)+ Vitest。ダミーテスト1本がパスすること
- [x] ルートに `pnpm -r test` スクリプト

**受け入れ基準**: `pnpm install && pnpm -r test` が成功する。

## Phase 1 — コア + CLI

### 1-1. 注釈JSONスキーマ(SPEC §4)

- [x] test: 有効フィクスチャ3件がparse成功 — ①基本(SPEC §4.3そのまま)②2カラム合成(§4.4)③最小(canvas+空objects)
- [x] test: 無効フィクスチャがエラーになる — id重複 / version≠1 / points1点のline / w≤0のrect / 不正color / 未知のtype
- [x] 実装: `packages/core/src/schema.ts`(zod)。`parseAnnotation(json): AnnotationFile`(エラーは全issueを含む)

### 1-2. レンダラー(SPEC §6)

- [x] test: §4.3のJSON+naturalSizes({facility-add.png: 1280×1080})を入力し、出力HTMLに以下が含まれることをアサート:
  - figureの `aspect-ratio:1280/960` と `max-width:1000px`、`mm-print-l`
  - badgeの `left:17.3%`・`top:16%`・テキスト`1`
  - frameの `width:12.2%`
  - imgのクロップ計算 `height:112.5%`・`top:-12.5%`(§6.2の式)
  - svgの `viewBox="0 0 1280 960"` とpolyline点列 `377.6,883.2 …`(%→px変換)
  - arrowのみ `marker-end` があり、lineには無い
- [x] test: フェンスオプション(width:680→`mm-print-s`、border:true→`mm-border`、caption→figcaption)
- [x] 実装: `packages/core/src/render.ts`。**純関数**(`renderFigure(annotation, { naturalSizes, fence })`、ファイルI/O禁止)

### 1-3. mdビルド(SPEC §5, §6.3, §7)

- [x] test: フィクスチャプロジェクト(annotated-imageフェンス1つ+見出し+生HTML+`<hr class="page-break">` を含むmanual.md)→ 出力HTMLに: figure展開済み / テーマCSS埋め込み / 見出しid(`1-施設情報カテゴリーの追加` 形式)/ 生HTMLがそのまま残る / `<title>`=最初のh1
- [x] test: `<!-- toc -->` マーカー→ H2 のみの `<nav class="mm-toc">` 展開、slug が rehype-slug の id と一致、マーカー無しでは目次なし
- [x] test: 注釈付き画像をcrop指定してbuild → `dist/img/cropped/` にcrop範囲だけのPNGを生成し、HTMLはその画像を参照、元画像を出力先に残さない
- [x] test: 存在しないsrc参照はファイル名付きエラー
- [x] 実装: `packages/core/src/build.ts`(unified: remark-parse → remark-gfm → tocTransformer → annotated-image フェンス変換 → remark-rehype(allowDangerousHtml)→ rehype-raw → rehype-slug → rehype-stringify)。画像実サイズはimage-sizeで解決し、注釈付き画像はsharpで実クロップしてdist/img/cropped/へ出力、通常画像はdist/img/へコピー

### 1-4. 単一HTML化

- [x] test: `--single-file` 出力に `src="img/` が残らず `data:image/png;base64,` を含む
- [x] 実装: build.tsのオプション

### 1-5. PDF出力(SPEC §7)

- [x] test(スモーク): フィクスチャプロジェクト→ `dist/manual.pdf` が生成され、サイズ>1KB
- [x] 実装: `packages/core/src/pdf.ts`(Playwright chromium、printBackground:true、A4、margin 12mm)。`pnpm exec playwright install chromium` を事前実行

### 1-6. CLI配線(SPEC §8)

- [x] test: `manual new` がSPEC §3の構造を生成 / `manual build` `manual pdf` がフィクスチャで成功終了コード0 / 不正プロジェクトパスで1
- [x] test: renumber — badge3つ(n=5,2,9)を配列順で1,2,3に振り直す(core関数の単体テスト)
- [x] 実装: `packages/cli`(commander)。bin名 `manual`。ルートpackage.jsonに `"manual": "pnpm --filter @MahoManual/cli exec manual"` 相当のスクリプト

### 1-7. 実証デモ(Phase 1受け入れ基準)

- [x] `projects/example` を作成: `sample/manual.md` のセクション1を新形式(フェンス+annotations/1-1.json)へ変換。ベース画像は `sample/img/1-1.png` をコピーして使い、焼き込み済みの丸数字・枠・線の**同じ位置に**オーバーレイを配置する(§4.4の要須。座標は目視で近似でよい)
- [x] `manual build projects/example && manual pdf projects/example` が成功
- [x] ブラウザでdist/manual.htmlを開き、オーバーレイが焼き込み注釈とほぼ重なることを目視確認(レンダラー正しさの実証)。スクショを撮って確認する

**受け入れ基準**: 上記デモが通る。`pnpm -r test` 全パス。この時点でClaude Codeがファイル編集+CLIだけでマニュアルを作成できる。

## Phase 2 — 撮影エンジン(SPEC §9)

### 2-1. レシピスキーマ

- [x] test: §9.1のYAML例がparse成功 / 不正(url欠落、未知step、targetが不正)がエラー
- [x] 実装: schema.tsに追加(YAMLパースは `yaml` パッケージ)

### 2-2. 座標変換(純関数)

- [x] test: boundingBox {x:100,y:200,w:50,h:30}、領域 {x:0,y:0,w:1280,h:960} → badge(左中央-16px)at {x:6.5625, y:22.3958…} / frame(padding4)rect {x:7.5, y:20.416…, w:4.53125, h:3.958…} 相当の変換を小数点以下まで検証(値はテスト内で式から算出してよい)
- [x] 実装: `packages/core/src/capture-math.ts`(Playwright非依存の純関数)

### 2-3. 撮影エンジンe2e

- [x] test: テスト用フィクスチャHTML(疑似CMS管理画面: フォーム+サイドメニュー、`tests/fixtures/fake-cms/index.html`)をnode:httpで配信し、レシピ(waitFor+fill+fullPage+badge2つ+frame1つ)を実行 → `img/raw/`と`img/`にPNG生成 / annotations JSONにsource:"recipe"・recipeRef・連番nのオブジェクト / canvasがviewport CSS px / cropが実ピクセル(2倍)
- [x] 実装: `packages/core/src/capture.ts`(deviceScaleFactor:2、storageState対応、§9.2のフロー)

### 2-4. マージ規則(SPEC §9.4)

- [x] test(純関数): 既存JSON(recipe由来2件+manual1件)+新撮影結果(recipe由来は位置変更・1件減)→ recipe由来が置換され、消えたindexが削除され、manualが保持される
- [x] 実装: `mergeAnnotations(existing, captured, recipeId)`

### 2-5. CLIコマンド

- [x] test: `manual capture <project> <recipeId>` がフィクスチャCMSで成功 / `--all` で複数レシピ実行
- [x] 実装: `manual login`(headed起動→ブラウザクローズでstorageState保存。自動テスト不要、動作手順をコマンドのヘルプに記載)と `manual capture`

**受け入れ基準**: 疑似CMSに対する撮影→注釈自動生成→build→PDF の一連が全てテストで通る。

## Phase 3 — MCPサーバー(SPEC §10)

- [x] test: InMemoryトランスポートでSDKクライアントを接続し、全ツールを実行 — list_manuals / read_manual / read_annotation / add_annotation(不正オブジェクトはエラーメッセージにissue含む)/ update_annotation / remove_annotation / set_crop / renumber_badges / build_html / export_pdf / run_capture
- [x] 実装: `packages/mcp`(@modelcontextprotocol/sdk、stdio)。全ツールはcore関数の呼び出しのみ
- [x] `.mcp.json` 設定例をREADMEに記載し、実際にClaude Codeから接続確認

**受け入れ基準**: MCPクライアントからマニュアルの読取・注釈編集・ビルド・撮影が完結する。

## Phase 4 — GUI注釈エディタ(SPEC §11)

- [x] test: Hono API — GET/PUT `annotations/:id`(PUT時zod検証)/ GET プロジェクト一覧 / POST 画像(ペースト取り込み)/ SSE `/watch`(ファイル変更イベント)
- [x] 実装: `packages/app/server`(Hono + chokidar)
- [x] 実装: エディタUI(Vite + React + Tailwind v4)
  - coreレンダラーのfigure DOMをそのまま表示(WYSIWYG一致)
  - パレットからbadge/text/frame/line/arrow追加、react-moveableでドラッグ・リサイズ→%座標で保存
  - クロップUI(imageオブジェクトのcrop編集)
  - クリップボードペーストで `img/raw/` へ保存+注釈JSON雛形生成
  - SSE受信で再読込(AI/CLI編集の即時反映)
- [x] test(Playwright e2e): プロジェクトを開く→badge追加→ドラッグ→保存→JSONファイルが更新される / 外部でJSONを書き換える→画面に反映される
- [x] 目視確認: エディタ表示とbuild後HTMLの見た目が一致する

**受け入れ基準**: GUIだけで「画像取り込み→注釈→保存」が完結し、AI編集とライブ同期する。

## Phase 5 — 統合エディタ

- [x] CodeMirror 6のmdエディタ+右ペインプレビュー(coreのbuildをブラウザ用に流用)
- [x] プレビュー内のfigureクリック→該当注釈エディタを開く
- [x] renumber実行時、本文中のUnicode丸数字(①②…)との個数不一致を警告表示
- [x] マニュアル編集ページから HTML/PDF をダウンロードできる
- [x] マニュアル編集ページから目次・画像(annotated-image)をカーソル位置へ挿入できる
- [x] test: 主要フローのe2e(md編集→プレビュー反映、figureクリック遷移、HTML/PDF出力、目次/画像挿入)

**受け入れ基準**: sample/manual.md 相当のマニュアルを、本ツールのみで新規作成→HTML/PDF納品できる。

---

## Phase 6 — キャンバス余白(画像外への注釈配置、SPEC §4.5)

画像端の外側(例: 左端メニューのさらに左)へ注釈を置けるよう、canvasを拡張して余白を作る。余白はレイアウトで表現し、画像画素・cropには含めない。

### 6-1. core: expandCanvas(純関数)

- [x] test: 左320px追加(canvas 1280×960→1600×960)で image rect {0,0,100,100} が {20,0,80,100} になり、badge at / frame rect / line points の%座標が再計算されて見た目の位置が維持される(上余白はy側) / crop・size・fontSize等のpx値は不変 / 負のmarginで縮小できる / 結果のcanvas寸法が0以下になるmarginはエラー
- [x] test: cropスキーマが x<0 / y<0 を拒否する(余白をcropで表現することの禁止)
- [x] 実装: `packages/core/src/expand-canvas.ts`(`expandCanvas(annotation, margin)`)、schema.tsのcrop x,yに `.gte(0)`

### 6-2. MCP: expand_canvas ツール

- [x] test: InMemoryトランスポートで expand_canvas 実行→注釈JSONのcanvasと全オブジェクト座標が更新される / 不正margin(canvas寸法が0以下)はエラーメッセージを返す
- [x] 実装: project.tsに `expandCanvasFile(projectRoot, id, margin)`、mcp/server.tsにツール追加

### 6-3. レシピ: screenshot.margin

- [x] test: margin付きレシピのparse成功 / 不正margin(数値以外)はエラー
- [x] test(e2e): margin付きレシピでcapture → canvasが領域+margin寸法、imageのrectがオフセット、badge%座標が余白込み、スクショPNG自体は領域のみ
- [x] 実装: schema.ts(screenshotにmargin追加)、capture.ts(生成結果にexpandCanvasを適用してからマージ)

### 6-4. GUI: 余白追加UI

- [x] test(e2e): 余白を追加→既存オブジェクトの表示位置(px)が維持される→保存でJSONのcanvas・座標が更新される
- [x] 実装: AnnotationEditorにキャンバス余白UI(上/右/下/左のpx入力、coreのexpandCanvasを使用)

**受け入れ基準**: 画像左端の要素のさらに左へbadgeを置いたマニュアルを、GUI・MCP・レシピのいずれからでも作成でき、HTML/PDF納品に余白が反映される。

---

## Phase 7 — 複数画像配置とオブジェクトロック

### 7-1. データモデル・画像追加API

- [x] test: `locked?: boolean` のparse成功・不正型拒否 / ロック中オブジェクトが移動・削除対象から除外される
- [x] test: 既存注釈への画像追加APIで画像ファイルと一意なimageオブジェクトが追加され、canvasと既存オブジェクトを維持する
- [x] 実装: Baseに `locked?: boolean`、coreに非破壊の画像追加処理、Honoに既存注釈向け画像追加API

### 7-2. GUI: 複数画像配置・ロック

- [x] test(e2e): 既存キャンバスへ画像追加→ドラッグ移動→ロック後は移動・削除不可→保存でJSONへ反映
- [x] 実装: 画像追加ボタン、画像のドラッグ・リサイズ、オブジェクト一覧のロック切替。ベース/レシピ画像は既定ロック、追加画像は既定ロック解除

**受け入れ基準**: GUIだけで複数画像を同一キャンバスへ追加して横並び・重ね合わせでき、確定したオブジェクトをロックして誤操作を防げる。

---

## Phase 8 — Markdownライブプレビュー編集

Markdownテキストを正本として維持したまま、CodeMirror 6のDecoration/WidgetでObsidian風のライブプレビュー編集を提供する。従来のソース編集と右ペインの完成プレビューは残し、表示を切り替えられるようにする。

- [x] test: annotated-imageフェンスの検出 — 複数フェンスとチルダフェンスを検出し、別のコードフェンス内にある記法例やsrcなしフェンスは無視する
- [x] test(e2e): ライブプレビュー切替→見出し装飾とannotated-imageのfigure表示 / Markdownソース表示への復帰 / figureクリックで注釈エディタへ遷移
- [x] 実装: CodeMirror StateField/ViewPluginによるMarkdown装飾。カーソルを含むブロックは記法を表示し、入力中のReact再レンダリングを発生させない
- [x] 実装: annotated-imageフェンスをcoreプレビューと同じfigure DOMのブロックWidgetとして表示し、フェンスソースを再表示できる操作を提供
- [x] 実装: ツールバーにライブプレビュー切替を追加。従来のソース編集・右ペインプレビュー・保存・挿入操作との互換性を維持

**受け入れ基準**: Markdownソースを変換・再生成せず、ライブプレビュー内で本文を編集でき、独自画像フェンスと既存の注釈編集導線が機能する。

### 8-1. Block Widgetのカーソル移動

- [x] test: 画像フェンス直前・直後の行を判定し、離れた行のArrowUp/ArrowDownは横取りしない
- [x] test(e2e): ライブプレビューの画像下からArrowUpでフェンスソースへ入り、画像を飛び越えて見出しまで移動しない
- [x] fix: Block Widgetの垂直marginを内部余白へ移し、ArrowUp/ArrowDown専用キーマップで画像フェンスへ選択を移す

**受け入れ基準**: ライブプレビュー内で矢印キーを使ってもキャレット位置が大きく飛ばず、画像フェンスをまたぐ際はMarkdownソースを表示して編集できる。

---

## Phase 9 — 安全なモザイクオブジェクト

### 9-1. データモデル・画像処理

- [x] test: mosaicのparse成功 / 対象image不存在・不正blockSize拒否 / キャンバス余白でrectを再計算
- [x] test: canvas%から対象画像のcrop実ピクセルへ変換し、Sharpの縮小・最近傍拡大で指定範囲だけをモザイク化
- [x] 実装: `MosaicObj`スキーマ、座標変換純関数、画像バッファへのモザイク適用

### 9-2. 安全な納品出力

- [x] test: build後のcrop画像は対象画素が実際にモザイク化され、HTMLからmosaicオーバーレイと未加工画像を除外
- [x] test: 合成PNGでもモザイク適用済み画像を使用
- [x] 実装: HTML/single-file/PDF/合成PNGで加工済み画像を使用し、元画像を納品物へ含めない

### 9-3. GUI

- [x] test(e2e): mosaic追加→対象画像・粗さ指定→ドラッグ/リサイズ→保存
- [x] 実装: パレット・キャンバス操作・対象画像選択・blockSize入力・ロック対応

**受け入れ基準**: GUIで画像の特定範囲にモザイクを配置でき、HTML/PDF/合成PNGの納品物から対象範囲の元画素を取得できない。

---

## Phase 10 — 注釈エディタ操作性改善

### 10-1. 初回実装

- [x] 直接配置＋連続丸数字: 選択ツールを追加し、badge/text/cursor はクリック位置、frame/mosaic はドラッグ範囲、line/arrow はクリック頂点から作成する。badge は `nextBadgeNumber` で連続配置し、選択状態・ツールチップ・作成中プレビューを表示する
- [x] ズーム・パン: 25〜400%を25%刻みで変更できる操作、100%・全体表示、初期全体表示のリサイズ追従、ポインタ中心ホイールズーム、Space+ドラッグのパン、Cmd/Ctrl+0・1を追加する。表示状態だけを変更し注釈データは維持する
- [x] 基本ショートカット: 入力欄フォーカス中を含むCmd/Ctrl+S保存、選択中の編集可能オブジェクトを1%ずらすCmd/Ctrl+D複製、ショートカット凡例を追加する

### 10-2. 精密編集

- [x] ビジュアルクロップ、矩形選択、整列・等間隔、スマートガイド、Altドラッグ複製、前後移動を実装する

### 10-3. 反復作業とナビゲーション

- [x] localStorageの直近スタイル、`project.yaml` の `annotation.defaults`、スタイルコピー、一覧の一時非表示・単独表示を実装する
- [x] 前後注釈移動、未保存移動バナー、インラインテキスト編集を実装する

### 10-4. 履歴とAI共同編集

- [x] 入力履歴統合、coreの3-wayマージ、オブジェクト単位競合解決を実装する
- [x] fix: 丸数字・テキスト・カーソルの選択中に点線枠が確実に表示されるよう修正する

### 10-5. テキストボックス

- [x] テキストの配置データに矩形(`rect`)を追加し、既存の`at`形式を読み込み互換として維持する
- [x] テキストを改行・折り返し可能な矩形ボックスとして描画し、右パネルとリサイズハンドルからx/y/w/h(%)を編集する
- [x] キャンバス上のダブルクリックでボックス内textareaを開き、Cmd/Ctrl+Enter・フォーカスアウト確定、Esc取消を行う
- [x] 文字揃え、内側余白、ボーダー(色・幅・角丸)を設定し、スタイル既定値・コピー貼り付け・納品HTMLへ反映する
- [x] 「内容に合わせて高さを調整」でブラウザ実測値を`rect.h`へ確定する
- [x] テキスト配置の左上をクリック座標に合わせ、インライン編集のキャレット操作を復旧し、通知・競合バナーをキャンバス領域へ重ねて表示する

### 10-6. 重なりオブジェクトのドラッグ

- [x] frame背面にある選択済みbadge/text/cursorを再ドラッグした場合、frameではなく選択済みオブジェクトを移動する

**受け入れ基準**: 各段階の操作が既存の注釈JSON・座標系・WYSIWYG描画を壊さず、Vitest・Playwright・実画面確認で検証されている。

---

## Phase 11 — 納品ファイル名設定

- [x] test: `project.yaml` の出力ファイル名を読み書きし、不正なパス・拡張子を拒否する
- [x] test: Hono APIが設定を更新し、HTML/PDFのContent-Dispositionへ反映する
- [x] test(e2e): プロジェクト画面でHTML/PDFファイル名を保存し、出力ボタンへ反映する
- [x] 実装: `output.html` / `output.pdf` をcoreで管理し、Hono APIとGUI設定カードを追加する

**受け入れ基準**: プロジェクトごとに安全なHTML/PDF納品ファイル名を設定でき、GUIのダウンロードに反映される。

---

## Phase 12 — 注釈エディタ全画面モーダル化

マニュアル編集画面から注釈付き画像をクリックしたとき、ページ遷移せず全画面モーダルで注釈エディタを開く。ManualEditorとCodeMirrorを再マウントせず、未保存Markdown・スクロール位置・ライブプレビュー状態を保持する。

### 12-1. モーダル基本導線

- [ ] test(e2e): 右プレビューの画像クリックで `annotation-modal` が表示される / URLが `/manual?annotation=:id` になる / `md-editor` がDOM上に残り編集内容が保たれる / モーダルを閉じるとクエリーが消え未保存内容が残る
- [ ] 実装: `AnnotationEditorModal.tsx` 新規作成、`AnnotationEditor` に `presentation` prop追加、`ManualEditor` にクエリーパラメータとモーダル表示

### 12-2. 閉じる・履歴・未保存保護

- [ ] test(e2e): clean状態の閉じる / dirty状態で未保存バナー / キャンセルで維持 / 保存して閉じる / 破棄して閉じる / ブラウザ戻る・進む / `?annotation=` 付きURL直接表示
- [ ] 実装: 既存 `requestNavigation` を再利用した閉じる処理

### 12-3. プレビュー同期とID変更

- [ ] test(e2e): 注釈保存後にプレビューへ反映 / ライブプレビューにも反映 / 未保存Markdownが失われない / Markdown dirty中はID変更無効 / clean時のID変更でCodeMirrorとURL更新
- [ ] 実装: `onSaved` コールバック、`hostMarkdownDirty` によるID変更制限

### 12-4. キーボード・フォーカス・回帰

- [ ] test(e2e): Enter/Spaceで画像からモーダルを開ける / Tab/Shift+Tabがモーダル外へ出ない / Escの優先順位 / 閉じた後に起点へフォーカス復帰 / 前・次移動でモーダル維持 / 独立URL `/annotations/:id` は全画面 / プロジェクト画面の注釈一覧と画像取り込み直後の導線が壊れていない
- [ ] 実装: フォーカストラップ、`inert`、キーボード起動

**受け入れ基準**: マニュアル編集画面から注釈エディタをモーダルで開閉でき、未保存状態・履歴・プレビュー同期・キーボード操作が正しく動作し、既存の独立ページ表示と全e2eテストが維持される。

---

## Phase 12 — 注釈エディタ全画面モーダル化

マニュアル編集画面から注釈付き画像をクリックしたとき、ページ遷移せず全画面モーダルで注釈エディタを開く。ManualEditorとCodeMirrorを再マウントせず、未保存Markdown・スクロール位置・ライブプレビュー状態を保持する。

### 12-1. モーダル基本導線

- [ ] test(e2e): 右プレビューの画像クリックで `annotation-modal` が表示される / URLが `/manual?annotation=:id` になる / `md-editor` がDOM上に残り編集内容が保たれる / モーダルを閉じるとクエリーが消え未保存内容が残る
- [ ] 実装: `AnnotationEditorModal.tsx` 新規作成、`AnnotationEditor` に `presentation` prop追加、`ManualEditor` にクエリーパラメータとモーダル表示

### 12-2. 閉じる・履歴・未保存保護

- [ ] test(e2e): clean状態の閉じる / dirty状態で未保存バナー / キャンセルで維持 / 保存して閉じる / 破棄して閉じる / ブラウザ戻る・進む / `?annotation=` 付きURL直接表示
- [ ] 実装: 既存 `requestNavigation` を再利用した閉じる処理

### 12-3. プレビュー同期とID変更

- [ ] test(e2e): 注釈保存後にプレビューへ反映 / ライブプレビューにも反映 / 未保存Markdownが失われない / Markdown dirty中はID変更無効 / clean時のID変更でCodeMirrorとURL更新
- [ ] 実装: `onSaved` コールバック、`hostMarkdownDirty` によるID変更制限

### 12-4. キーボード・フォーカス・回帰

- [ ] test(e2e): Enter/Spaceで画像からモーダルを開ける / Tab/Shift+Tabがモーダル外へ出ない / Escの優先順位 / 閉じた後に起点へフォーカス復帰 / 前・次移動でモーダル維持 / 独立URL `/annotations/:id` は全画面 / プロジェクト画面の注釈一覧と画像取り込み直後の導線が壊れていない
- [ ] 実装: フォーカストラップ、`inert`、キーボード起動

**受け入れ基準**: マニュアル編集画面から注釈エディタをモーダルで開閉でき、未保存状態・履歴・プレビュー同期・キーボード操作が正しく動作し、既存の独立ページ表示と全e2eテストが維持される。

---

## Phase 12 — 注釈エディタ全画面モーダル化

マニュアル編集画面から注釈付き画像をクリックしたとき、ページ遷移せず全画面モーダルで注釈エディタを開く。ManualEditorとCodeMirrorを再マウントせず、未保存Markdown・スクロール位置・ライブプレビュー状態を保持する。

### 12-1. モーダル基本導線

- [ ] test(e2e): 右プレビューの画像クリックで `annotation-modal` が表示される / URLが `/manual?annotation=:id` になる / `md-editor` がDOM上に残り編集内容が保たれる / モーダルを閉じるとクエリーが消え未保存内容が残る
- [ ] 実装: `AnnotationEditorModal.tsx` 新規作成、`AnnotationEditor` に `presentation` prop追加、`ManualEditor` にクエリーパラメータとモーダル表示

### 12-2. 閉じる・履歴・未保存保護

- [ ] test(e2e): clean状態の閉じる / dirty状態で未保存バナー / キャンセルで維持 / 保存して閉じる / 破棄して閉じる / ブラウザ戻る・進む / `?annotation=` 付きURL直接表示
- [ ] 実装: 既存 `requestNavigation` を再利用した閉じる処理

### 12-3. プレビュー同期とID変更

- [ ] test(e2e): 注釈保存後にプレビューへ反映 / ライブプレビューにも反映 / 未保存Markdownが失われない / Markdown dirty中はID変更無効 / clean時のID変更でCodeMirrorとURL更新
- [ ] 実装: `onSaved` コールバック、`hostMarkdownDirty` によるID変更制限

### 12-4. キーボード・フォーカス・回帰

- [ ] test(e2e): Enter/Spaceで画像からモーダルを開ける / Tab/Shift+Tabがモーダル外へ出ない / Escの優先順位 / 閉じた後に起点へフォーカス復帰 / 前・次移動でモーダル維持 / 独立URL `/annotations/:id` は全画面 / プロジェクト画面の注釈一覧と画像取り込み直後の導線が壊れていない
- [ ] 実装: フォーカストラップ、`inert`、キーボード起動

**受け入れ基準**: マニュアル編集画面から注釈エディタをモーダルで開閉でき、未保存状態・履歴・プレビュー同期・キーボード操作が正しく動作し、既存の独立ページ表示と全e2eテストが維持される。

---

## Phase 12 — 注釈エディタ全画面モーダル化

マニュアル編集画面から注釈付き画像をクリックしたとき、ページ遷移せず全画面モーダルで注釈エディタを開く。ManualEditorとCodeMirrorを再マウントせず、未保存Markdown・スクロール位置・ライブプレビュー状態を保持する。

### 12-1. モーダル基本導線

- [ ] test(e2e): 右プレビューの画像クリックで `annotation-modal` が表示される / URLが `/manual?annotation=:id` になる / `md-editor` がDOM上に残り編集内容が保たれる / モーダルを閉じるとクエリーが消え未保存内容が残る
- [ ] 実装: `AnnotationEditorModal.tsx` 新規作成、`AnnotationEditor` に `presentation` prop追加、`ManualEditor` にクエリーパラメータとモーダル表示

### 12-2. 閉じる・履歴・未保存保護

- [ ] test(e2e): clean状態の閉じる / dirty状態で未保存バナー / キャンセルで維持 / 保存して閉じる / 破棄して閉じる / ブラウザ戻る・進む / `?annotation=` 付きURL直接表示
- [ ] 実装: 既存 `requestNavigation` を再利用した閉じる処理

### 12-3. プレビュー同期とID変更

- [ ] test(e2e): 注釈保存後にプレビューへ反映 / ライブプレビューにも反映 / 未保存Markdownが失われない / Markdown dirty中はID変更無効 / clean時のID変更でCodeMirrorとURL更新
- [ ] 実装: `onSaved` コールバック、`hostMarkdownDirty` によるID変更制限

### 12-4. キーボード・フォーカス・回帰

- [ ] test(e2e): Enter/Spaceで画像からモーダルを開ける / Tab/Shift+Tabがモーダル外へ出ない / Escの優先順位 / 閉じた後に起点へフォーカス復帰 / 前・次移動でモーダル維持 / 独立URL `/annotations/:id` は全画面 / プロジェクト画面の注釈一覧と画像取り込み直後の導線が壊れていない
- [ ] 実装: フォーカストラップ、`inert`、キーボード起動

**受け入れ基準**: マニュアル編集画面から注釈エディタをモーダルで開閉でき、未保存状態・履歴・プレビュー同期・キーボード操作が正しく動作し、既存の独立ページ表示と全e2eテストが維持される。

---

## 実装時の注意

- ロジックはすべて `packages/core` に置く。cli / mcp / app は薄いラッパー(SPEC §2)
- レンダラー・座標変換・マージ規則は純関数として書き、Playwright依存コードと分離する
- `sample/` は改変禁止
- 座標系(%とpxの使い分け)は SPEC §4.1 を常に参照
