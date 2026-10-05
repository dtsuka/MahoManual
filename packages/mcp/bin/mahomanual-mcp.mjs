#!/usr/bin/env node
// MahoManual MCP サーバーの起動ファイル。ビルドせず、tsx で src/index.ts をそのまま実行する。
// tsx はこのパッケージの依存から読み込むため、実行時のフォルダ(cwd)に関係なく起動できる
import { register } from "tsx/esm/api";

register();
await import(new URL("../src/index.ts", import.meta.url).href);
