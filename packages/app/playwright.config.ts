import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "tsx server/dev.ts",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
  projects: [
    // example プロジェクトの 1-1.json / manual.md / project.yaml を共有するため単一ワーカーで直列実行
    {
      name: "shared-example",
      testMatch: /(annotation-editor-canvas|annotation-editor-panel|manual-editor|annotation-modal)\.spec\.ts/,
      fullyParallel: false,
      workers: 1,
    },
    {
      name: "isolated",
      testIgnore: /(annotation-editor-canvas|annotation-editor-panel|manual-editor|annotation-modal)\.spec\.ts/,
    },
  ],
});
