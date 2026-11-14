import { defineConfig } from "vitest/config";

// One test runner for the repo. Run one folder with: npm test -- server/checks
export default defineConfig({
  test: {
    include: ["{contracts,server,eval,mcp,web/src}/**/*.test.ts"],
    environment: "node",
    // Some suites replay all 190 golden messages in beforeAll; with every file running in parallel
    // that can exceed the 10 s default on a laptop. Tests themselves keep the default timeout.
    hookTimeout: 60_000,
  },
});
