import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/integration-health-report.test.mjs", "tests/t53-navigation-production-sampler.test.mjs", "tests/t55-runtime-analysis.test.mjs", "tests/t57-soak-analysis.test.mjs", "tests/t58-report.test.mjs"],
    exclude: ["tests/scale/**"],
    // Two workers match the local CPU budget and avoid contention in the mixed suite.
    maxWorkers: 2,
  },
  resolve: { alias: { "@": new URL("./", import.meta.url).pathname } },
});
