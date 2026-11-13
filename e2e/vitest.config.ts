import { defineConfig } from "vitest/config";

// End-to-end demo story over HTTP. Kept out of `npm test` (root include does not match e2e/).
// Run: npx vitest run --config e2e/vitest.config.ts
export default defineConfig({
  test: {
    include: ["e2e/**/*.e2e.test.ts"],
    environment: "node",
    // Full scenario: one golden replay (each reset) takes ~15 s and the MCP robot ~26 s on the demo laptop.
    testTimeout: 120_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
