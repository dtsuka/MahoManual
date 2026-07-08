import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 3000,
    environment: "node",
    exclude: ["**/node_modules/**", "**/dist/**", "tests/e2e/**"],
  },
});
