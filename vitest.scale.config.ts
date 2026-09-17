import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/scale/**/*.scale.ts"],
    maxWorkers: 1,
  },
  resolve: { alias: { "@": new URL("./", import.meta.url).pathname } },
});
