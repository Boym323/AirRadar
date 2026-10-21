import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const repositoryRoot = new URL("../", import.meta.url);
const packageScripts = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).scripts as Record<string, string>;

describe("retired one-off benchmarking CLI", () => {
  it("keeps obsolete measurement entrypoints and npm aliases removed", () => {
    const retired = [
      ["benchmark:radar-archive-retention", "scripts/benchmark-radar-archive-retention.ts"],
      ["benchmark:radar-frame-read", "scripts/benchmark-radar-frame-read.ts"],
      ["benchmark:route-telemetry", "scripts/benchmark-route-telemetry.ts"],
      ["benchmark:bounded-enrichment", "scripts/benchmark-bounded-enrichment.ts"],
    ] as const;
    for (const [alias, path] of retired) {
      expect(packageScripts[alias], alias).toBeUndefined();
      expect(existsSync(new URL(path, repositoryRoot)), path).toBe(false);
    }
  });

  it("retains scaling, ingest and history measurement gates", () => {
    for (const path of [
      "scripts/benchmark-load-scaling.ts",
      "scripts/benchmark-atc-ring-stalls.ts",
      "scripts/benchmark-history-payload.ts",
      "scripts/benchmark-beast-ingest.ts",
      "scripts/benchmark-live-performance.ts",
    ]) expect(existsSync(new URL(path, repositoryRoot)), path).toBe(true);
    expect(packageScripts["benchmark:load-scaling"]).toContain("benchmark-load-scaling.ts");
    expect(packageScripts["benchmark:runtime"]).toContain("benchmark-live-performance.ts");
  });
});
