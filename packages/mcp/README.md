# @mahomanual/mcp

MahoManual の MCP サーバー。`@mahomanual/core` のプロジェクト操作関数を stdio 経由の MCP ツールとして公開します。

## セットアップ

```bash
pnpm install
pnpm --filter @mahomanual/mcp run build
```

## Claude Code / MCP クライアント設定

リポジトリルートに `.mcp.json` を置く例:

```json
{
  "mcpServers": {
    "MahoManual": {
      "command": "node",
      "args": ["/Users/d_tsukada/Documents/MahoManual/packages/mcp/dist/index.js"]
    }
  }
}
```

`args` のパスは環境に合わせて絶対パスに置き換えてください。

## ツール一覧

| ツール | 説明 |
|---|---|
| `list_manuals` | `projects/` 配下のマニュアル一覧 |
| `read_manual` | `manual.md` 本文と annotations / captures 一覧 |
| `read_annotation` | 注釈 JSON 取得 |
| `add_annotation` | 注釈オブジェクト追加（zod 検証） |
| `update_annotation` | 注釈オブジェクト部分更新 |
| `remove_annotation` | 注釈オブジェクト削除 |
| `set_crop` | image オブジェクトの crop 変更 |
| `renumber_badges` | badge 採番の振り直し |
| `build_html` | 納品 HTML 生成 |
| `export_pdf` | PDF 生成 |
| `run_capture` | 撮影レシピ実行 |

エラー時は zod の issue を含む日本語メッセージを返します。

## 開発

```bash
pnpm --filter @mahomanual/mcp test
```

テストは InMemory トランスポートで SDK クライアントを接続し、全ツールを実行します。
