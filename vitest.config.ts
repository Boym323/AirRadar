import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/scale/**"],
    // Two workers match the local CPU budget and avoid contention in the mixed suite.
    maxWorkers: 2,
  },
  resolve: { alias: { "@": new URL("./", import.meta.url).pathname } },
});
