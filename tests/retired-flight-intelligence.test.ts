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
    for (const path of ["lib/server/flight-intelligence.ts", "lib/server/flight-intelligence-analytics.ts", "lib/intelligence/detector.ts", "lib/route-intelligence/conformance.ts", "lib/route-intelligence/corridor.ts", "lib/intelligence/replay.ts", "lib/intelligence/operations-center.ts", "lib/intelligence/terminal-evidence.ts", "tests/operations-center.test.ts", "tests/prospective-ground-truth.test.ts", "lib/intelligence-analytics.ts", "components/use-intelligence-stream.ts"]) {
      expect(existsSync(new URL("../" + path, import.meta.url)), path).toBe(false);
    }
    expect(existsSync(new URL("../lib/server/history.ts", import.meta.url))).toBe(true);
    expect(existsSync(new URL("../lib/intelligence/destination-provenance.ts", import.meta.url))).toBe(true);
    const benchmark = readFileSync(new URL("../scripts/benchmark-live-performance.ts", import.meta.url), "utf8");
    expect(benchmark).not.toContain("FlightIntelligenceDetector");
    expect(benchmark).not.toContain("snapshotApplyComparisonBenchmark");
  });

  it("does not retain retired one-off benchmark jobs or retired research evidence as runtime files", () => {
    for (const path of [
      "scripts/benchmark-aircraft-label-collision.ts",
      "scripts/benchmark-atc-context-offline.ts",
      "scripts/benchmark-network-trail-update.ts",
      "artifacts/flight-intelligence-v1-audit.json",
      "artifacts/predictive-intelligence-v1-replay.json",
      "artifacts/operational-twin-v46-iteration-1.md",
      "artifacts/predictive-terminal-ground-truth-v1.json",
    ]) expect(existsSync(new URL("../" + path, import.meta.url)), path).toBe(false);
    for (const path of [
      "scripts/benchmark-live-performance.ts",
      "scripts/benchmark-load-scaling.ts",
      "scripts/benchmark-atc-ring-stalls.ts",
      "scripts/t58-report.mjs",
      "lib/server/alert-delivery-worker.ts",
      "lib/server/history.ts",
    ]) expect(existsSync(new URL("../" + path, import.meta.url)), path).toBe(true);
  });
});
