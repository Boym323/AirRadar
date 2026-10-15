import { afterEach, describe, expect, it, vi } from "vitest";
import { OperationalTwinForensics } from "@/lib/operational-twin/forensics";

afterEach(() => vi.unstubAllEnvs());

describe("Operational Twin forensic diagnostics", () => {
  it("stays disabled by default", () => {
    vi.stubEnv("AIRRADAR_OPERATIONAL_TWIN_FORENSICS_ENABLED", "false");
    const diagnostics = new OperationalTwinForensics();
    diagnostics.measure("truthPoints", () => 1);
    expect(diagnostics.report()).toEqual({ enabled: false });
  });

  it("keeps bounded, identity-free phase, population, cache and interval summaries", () => {
    vi.stubEnv("AIRRADAR_OPERATIONAL_TWIN_FORENSICS_ENABLED", "true");
    const diagnostics = new OperationalTwinForensics();
    for (let index = 0; index < 8_192; index += 1) {
      diagnostics.measure("truthPoints", () => index + 1);
      diagnostics.recordSnapshotInterval(1_000 + index);
    }
    diagnostics.recordPopulation(5, 3, [1, 2, 5]);
    diagnostics.increment("captures");
    diagnostics.increment("expirations");
    diagnostics.increment("truthInvalidations");
    diagnostics.increment("actualTruthResolutions");
    diagnostics.cache(true);
    diagnostics.cache(false);

    const report = diagnostics.report();
    if (!report.enabled) throw new Error("forensics_disabled");
    expect(report.phases.truthPoints.calls).toBe(8_192);
    expect(report.phases.truthPoints.sampledCalls).toBe(32);
    expect(report.snapshotInvocationIntervalMs.samples).toBe(128);
    expect(report.pendingPopulation.samples).toBe(1);
    expect(report.pendingPerAircraftDistribution).toEqual({ one: 1, two: 1, threeToFour: 0, fiveToEight: 1, overEight: 0 });
    expect(report.counters).toMatchObject({ captures: 1, expirations: 1, truthInvalidations: 1, actualTruthResolutions: 1, cacheHits: 1, cacheMisses: 1 });
    expect(JSON.stringify(report)).not.toMatch(/ICAO|callsign|registration|coordinates|trajectory|icaoHex/i);
    expect(report.phases.truthPoints.sampleP50Ms).not.toBeNull();
  });
});
