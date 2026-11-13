import { defineConfig } from "vitest/config";

// One test runner for the repo. Run one folder with: npm test -- server/checks
export default defineConfig({
  test: {
    include: ["{contracts,server,eval}/**/*.test.ts"],
    environment: "node",
  },
});
