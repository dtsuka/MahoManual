# @mahomanual/mcp

MahoManual の MCP サーバー。`@mahomanual/core` のプロジェクト操作関数を stdio 経由の MCP ツールとして公開します。

## セットアップ

```bash
pnpm install
```

ビルドは不要です。起動ファイル `bin/mahomanual-mcp.mjs` が tsx で `src/index.ts` をそのまま実行します。

## Claude Code / MCP クライアント設定

リポジトリルートに `.mcp.json` を置く例:

```json
{
  "mcpServers": {
    "MahoManual": {
      "command": "node",
      "args": ["/Users/d_tsukada/Documents/MahoManual/packages/mcp/bin/mahomanual-mcp.mjs"]
    }
  }
}
```

`args` のパスは環境に合わせて絶対パスに置き換えてください。実行時のフォルダ(`cwd`)はどこでも構いません。

`projects/` 以外のフォルダのマニュアルを扱うときは、環境変数 `MAHOMANUAL_PROJECTS_DIR` にそのフォルダを指定します(`"env": { "MAHOMANUAL_PROJECTS_DIR": "/path/to/projects" }`)。

## 引数 `project`

`project` には `projects/`(または `MAHOMANUAL_PROJECTS_DIR`)配下のプロジェクト名(フォルダ名)だけを指定できます。パス(`..` や絶対パス)は受け付けません。プロジェクト名・注釈ID・レシピIDに使える文字は、文字(日本語を含む)・数字・`-`・`_` です。

## ツール一覧

| ツール | 説明 |
|---|---|
| `list_manuals` | `projects/` 配下のマニュアル一覧 |
| `read_manual` | `manual.md` 本文と annotations / captures 一覧 |
| `read_annotation` | 注釈 JSON 取得 |
| `add_annotation` | 注釈オブジェクト追加（zod 検証） |
| `update_annotation` | 注釈オブジェクト部分更新（`patch` に `id` / `type` を含めるとエラー） |
| `remove_annotation` | 注釈オブジェクト削除 |
| `set_crop` | image オブジェクトの crop 変更 |
| `expand_canvas` | キャンバス余白の追加・削除（全オブジェクトの % 座標を再計算し、見た目の位置を保つ） |
| `renumber_badges` | badge 採番の振り直し |
| `build_html` | 納品 HTML 生成 |
| `export_pdf` | PDF 生成 |
| `run_capture` | 撮影レシピ実行 |

エラー時は zod の issue を含む日本語メッセージを返します。

## 開発

```bash
pnpm --filter @mahomanual/mcp test
```

テストは InMemory トランスポートで SDK クライアントを接続して全ツールを実行するものと、起動ファイルを stdio で起動して `initialize` とツール呼び出しを確認するものがあります。どちらも一時フォルダにコピーしたフィクスチャだけを使います。
