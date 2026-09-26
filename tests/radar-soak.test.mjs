import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const baselineSource = readFileSync(new URL("../scripts/radar-performance-baseline.mjs", import.meta.url), "utf8");
const workflowSource = readFileSync(new URL("../.github/workflows/radar-soak.yml", import.meta.url), "utf8");
const packageSource = readFileSync(new URL("../package.json", import.meta.url), "utf8");
const gitignoreSource = readFileSync(new URL("../.gitignore", import.meta.url), "utf8");

describe("radar production soak", () => {
  it("measures browser and server memory footprints after forced browser GC", () => {
    expect(baselineSource).toContain('process.env.RADAR_PERF_SOAK === "1"');
    expect(baselineSource).toContain('HeapProfiler.collectGarbage');
    expect(baselineSource).toContain('JSHeapUsedSize');
    expect(baselineSource).toContain('JSEventListeners');
    expect(baselineSource).toContain('VmRSS');
    expect(baselineSource).toContain('serverRssBytes');
  });

  it("churns real SSE v2 clients and requires cleanup to zero", () => {
    expect(baselineSource).toContain('/api/stream?v=2&coverage=local');
    expect(baselineSource).toContain('activeSseClients');
    expect(baselineSource).toContain('(count) => count === 0');
    expect(baselineSource).toContain('SSE clients leaked after churn');
  });

  it("uses authenticated detailed diagnostics for the soak process", () => {
    expect(baselineSource).toContain('/api/watchlist/session');
    expect(baselineSource).toContain('payload.detailLevel !== "admin"');
    expect(baselineSource).toContain('WATCHLIST_ADMIN_TOKEN: soakMode ? soakAdminToken : ""');
  });

  it("runs 500, 1000, and 1600 aircraft as a scheduled workflow instead of every PR", () => {
    expect(JSON.parse(packageSource).scripts["benchmark:radar:soak"]).toContain("RADAR_PERF_SCENARIOS=500,1000,1600");
    expect(workflowSource).toContain('cron: "17 2 * * *"');
    expect(workflowSource).toContain("npm run benchmark:radar:soak");
    expect(workflowSource).toContain("timeout-minutes: 20");
  });

  it("publishes and ignores generated soak artifacts", () => {
    expect(workflowSource).toContain("artifacts/radar-performance-soak.json");
    expect(workflowSource).toContain("artifacts/radar-performance-soak.md");
    expect(gitignoreSource).toContain("artifacts/radar-performance-soak.json");
    expect(gitignoreSource).toContain("artifacts/radar-performance-soak.md");
  });
});
