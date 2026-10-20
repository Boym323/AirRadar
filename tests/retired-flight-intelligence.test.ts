import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Retired Flight Intelligence backend boundary", () => {
  it("keeps the former detector and singleton out of live ADS-B ingestion", () => {
    const service = readFileSync(new URL("../lib/server/aircraft-state.ts", import.meta.url), "utf8");
    expect(service).not.toContain("getFlightIntelligenceService");
    expect(service).not.toContain("this.intelligence.getDiagnostics");
    expect(service).toContain("this.navigationIntegrity.observe(activeAircraft");
    expect(service).toContain("recordAircraftSnapshot(");
  });

  it("never reintroduces discarded Flight Intelligence services while keeping history", () => {
    for (const path of ["lib/server/flight-intelligence.ts", "lib/server/flight-intelligence-analytics.ts", "lib/intelligence/detector.ts", "lib/intelligence/replay.ts", "lib/intelligence/operations-center.ts", "lib/intelligence/terminal-evidence.ts", "tests/operations-center.test.ts", "tests/prospective-ground-truth.test.ts"]) {
      expect(existsSync(new URL("../" + path, import.meta.url)), path).toBe(false);
    }
    expect(existsSync(new URL("../lib/server/history.ts", import.meta.url))).toBe(true);
    expect(existsSync(new URL("../lib/intelligence/destination-provenance.ts", import.meta.url))).toBe(true);
    const benchmark = readFileSync(new URL("../scripts/benchmark-live-performance.ts", import.meta.url), "utf8");
    expect(benchmark).not.toContain("FlightIntelligenceDetector");
    expect(benchmark).not.toContain("snapshotApplyComparisonBenchmark");
  });
});
