# MahoManual

CMS操作マニュアルを Markdown + 注釈JSON で作成し、HTML/PDF で納品するツール。

## セットアップ

```bash
pnpm install
cd packages/core && pnpm exec playwright install chromium
pnpm --filter @mahomanual/mcp run build   # MCP 利用時
```

## コマンド

```bash
pnpm manual new <name>          # プロジェクト雛形作成
pnpm manual build <project>     # HTML ビルド
pnpm manual pdf <project>       # PDF 出力
pnpm manual capture <project> <recipeId> [--all]
pnpm manual renumber <project> <annotationId>
```

## GUI エディタ

```bash
cd packages/app && pnpm dev
# http://127.0.0.1:5173
```

## MCP

`packages/mcp/README.md` および `.mcp.json` を参照。

## テスト

```bash
pnpm -r test
```
