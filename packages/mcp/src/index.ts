#!/usr/bin/env node
import { resolve } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMahoManualServer } from "./server.js";

async function main(): Promise<void> {
  // MAHOMANUAL_PROJECTS_DIR でプロジェクトを置くフォルダを変更できる(既定はリポジトリの projects/)
  const projectsDir = process.env.MAHOMANUAL_PROJECTS_DIR;
  const server = createMahoManualServer({ projectsDir: projectsDir ? resolve(projectsDir) : undefined });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
