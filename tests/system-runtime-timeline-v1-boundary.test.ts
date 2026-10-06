import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const statusPage = readFileSync(new URL("../components/system-status-page.tsx", import.meta.url), "utf8");
const timeline = readFileSync(new URL("../components/system-runtime-timeline.tsx", import.meta.url), "utf8");
const runtimeRoute = readFileSync(new URL("../app/api/system/runtime-history/route.ts", import.meta.url), "utf8");

describe("System & Receiver Timeline V1 boundary", () => {
  it("mounts the timeline only inside the admin detail surface", () => {
    expect(statusPage).toContain('detailed && <SystemRuntimeTimeline locale={locale} />');
    expect(runtimeRoute).toContain("isWatchlistSessionValid");
    expect(runtimeRoute).toContain("Authentication required");
  });

  it("reuses the existing authenticated runtime-history endpoint only", () => {
    expect(timeline).toContain("/api/system/runtime-history");
    expect(timeline).not.toContain("getPrisma");
    expect(timeline).not.toContain("/api/system/timeline");
    expect(timeline).not.toContain("runtime-telemetry-v1.json");
  });

  it("derives only events supportable by minute telemetry", () => {
    expect(timeline).toContain("localProviderState");
    expect(timeline).toContain("networkProviderState");
    expect(timeline).toContain("databaseState");
    expect(timeline).toContain("aircraftCount");
    expect(timeline).toContain("DB_LATENCY_SPIKE_MIN_MS");
    expect(timeline).toContain("DB_LATENCY_SPIKE_FACTOR");
    expect(timeline).not.toContain("feed gap");
    expect(timeline).not.toContain("14 s");
  });
});
