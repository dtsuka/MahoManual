# MahoManual

CMS操作マニュアルを Markdown + 注釈JSON で作成し、HTML/PDF で納品するツール。

## セットアップ

```bash
pnpm install
cd packages/core && pnpm exec playwright install chromium
```

## コマンド

```bash
pnpm manual new <name>          # プロジェクト雛形作成
pnpm manual build <project>     # HTML ビルド
pnpm manual pdf <project>       # PDF 出力
pnpm manual capture <project> <recipeId> [--all]
pnpm manual renumber <project> <annotationId>
pnpm manual login <project> --url <URL>
```

`<project>` はパスまたは `projects/` 配下の名前です。`pnpm manual` 経由では、相対パスはリポジトリのルートを基準にします。`node packages/cli/bin/manual.mjs` を直接実行した場合は、実行時のフォルダを基準にします。`projects/` の場所は環境変数 `MAHOMANUAL_PROJECTS_DIR` で変更できます。

## GUI エディタ

```bash
cd packages/app && pnpm dev
# http://127.0.0.1:5173
```

## MCP

ビルドは不要です(`pnpm install` のみ)。起動ファイルは `packages/mcp/bin/mahomanual-mcp.mjs`。設定は `packages/mcp/README.md` および `.mcp.json` を参照。

## テスト

```bash
pnpm -r test
```
