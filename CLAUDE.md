# CLAUDE.md — MahoManual

CMS操作マニュアルをMarkdownで作成し、HTML/PDFで納品するローカルツール。
スクショへの注釈(丸数字・枠・罫線・矢印・テキスト)を画像に焼き込まず、**HTML/CSSオーバーレイ**として描画するのが設計の核。データはすべてプレーンテキスト(md + JSON + YAML)で、AI(Claude Code / MCP)からも人間(GUI)からも同じファイルを操作する。

## ドキュメント

- 仕様書: [docs/SPEC.md](docs/SPEC.md) — データモデル・レンダリング・CLI/撮影レシピ/MCP/GUIの全仕様
- 実装手順書: [docs/PLAN.md](docs/PLAN.md) — Phase 0〜5。**必ずこの順に実装する**

## 進め方(必須ルール)

- docs/PLAN.md のPhase順・ステップ順に実装する。ステップ完了ごとにPLAN.md内のチェックボックスを `[x]` に更新し、コミットに含める
- TDD厳守: テスト作成 → 失敗確認 → コミット → 実装 → テストパス → コミット。実装中にテストを書き換えない
- テストのタイムアウトは1〜3秒程度で十分。テストを通すためのタイムアウト延長・セキュリティ機能の無効化は禁止
- `sample/` は旧手作業マニュアルの参照資料。**改変禁止**(読み取りのみ)
- 座標系の原則: キャンバス=px(設計座標)、オブジェクト配置=%(0-100)、crop=画像ファイルの実ピクセル。迷ったら SPEC.md §4・§6 を読む

## 技術スタック

- Node.js >= 20 / ESM / TypeScript strict / pnpm workspace
- テスト: Vitest(`pnpm -r test`)
- 主要依存: zod, unified(remark/rehype), Playwright, commander, @modelcontextprotocol/sdk, Hono, React, Tailwind CSS v4, Vite

## 構成

```
packages/core   # スキーマ・レンダラー・mdビルド・PDF・撮影エンジン(全ロジック)
packages/cli    # manual コマンド(coreの薄いラッパー)
packages/mcp    # MCPサーバー(coreの薄いラッパー)
packages/app    # GUIエディタ(Vite + React + Hono)
projects/       # マニュアル実データ(1マニュアル=1フォルダ)
sample/         # 旧手作業マニュアル(参照資料・改変禁止)
```
