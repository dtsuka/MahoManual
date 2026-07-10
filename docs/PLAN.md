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
- [x] test: 存在しないsrc参照はファイル名付きエラー
- [x] 実装: `packages/core/src/build.ts`(unified: remark-parse → remark-gfm → tocTransformer → annotated-image フェンス変換 → remark-rehype(allowDangerousHtml)→ rehype-raw → rehype-slug → rehype-stringify)。画像実サイズは image-size で解決し dist/img/ へコピー

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

## 実装時の注意

- ロジックはすべて `packages/core` に置く。cli / mcp / app は薄いラッパー(SPEC §2)
- レンダラー・座標変換・マージ規則は純関数として書き、Playwright依存コードと分離する
- `sample/` は改変禁止
- 座標系(%とpxの使い分け)は SPEC §4.1 を常に参照
