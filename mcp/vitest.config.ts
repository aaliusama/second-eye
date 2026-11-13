import { defineConfig } from "vitest/config";

// Owner: F. Runs mcp/ tests on their own until the root config includes mcp/** (change request to A).
export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    environment: "node",
  },
});
