import { afterEach, describe, expect, it, vi } from "vitest";
import { OperationalTwinForensics } from "@/lib/operational-twin/forensics";

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

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

  it("uses exact per-window calls and the actual sample count for CPU estimates", () => {
    vi.spyOn(Date, "now").mockReturnValue(60_000);
    let monotonicMs = 0;
    let cpuMicros = 0;
    const diagnostics = new OperationalTwinForensics({
      enabled: true,
      monotonicNow: () => monotonicMs,
      cpuUsage: (previous) => previous
        ? { user: cpuMicros - previous.user, system: 0 }
        : { user: cpuMicros, system: 0 },
    });
    const operation = () => { monotonicMs += 1; cpuMicros += 250; };
    for (let index = 0; index < 256; index += 1) diagnostics.measure("truthPoints", operation);
    vi.spyOn(Date, "now").mockReturnValue(120_000);
    for (let index = 0; index < 42; index += 1) diagnostics.measure("truthPoints", operation);

    const report = diagnostics.report();
    if (!report.enabled) throw new Error("forensics_disabled");
    expect(report.phases.truthPoints).toMatchObject({ calls: 298, sampledCalls: 1, estimatedCpuMs: 74.5, estimatedWallMs: 298 });
    expect(report.windows[0]?.phases.truthPoints).toMatchObject({
      calls: 256, sampledCalls: 1, estimatedCpuMs: 64, estimatedWallMs: 256,
    });
    expect(report.windows[1]?.phases.truthPoints).toMatchObject({
      calls: 42, sampledCalls: 0, estimatedCpuMs: null, estimatedWallMs: null,
    });
  });

  it("detects a rare long synchronous operation outside the regular sample", () => {
    vi.spyOn(Date, "now").mockReturnValue(60_000);
    let monotonicMs = 0;
    const diagnostics = new OperationalTwinForensics({
      enabled: true,
      monotonicNow: () => monotonicMs,
      cpuUsage: () => ({ user: 0, system: 0 }),
    });
    diagnostics.measure("truthStateDiff", () => { monotonicMs += 1_400; }, { detectLongOperation: true });
    const report = diagnostics.report();
    if (!report.enabled) throw new Error("forensics_disabled");
    expect(report.phases.truthStateDiff).toMatchObject({
      calls: 1, sampledCalls: 0, longOperationCount: 1, longOperationMaxWallMs: 1_400,
    });
    expect(report.windows[0]?.phases.truthStateDiff).toMatchObject({
      calls: 1, sampledCalls: 0, longOperationCount: 1, longOperationMaxWallMs: 1_400,
    });
    expect(JSON.stringify(report)).not.toMatch(/ICAO|callsign|registration|coordinates|trajectory/i);
  });

  it("does not run clocks or CPU sampling when disabled", () => {
    const monotonicNow = vi.fn(() => 0);
    const cpuUsage = vi.fn(() => ({ user: 0, system: 0 }));
    const diagnostics = new OperationalTwinForensics({ enabled: false, monotonicNow, cpuUsage });
    expect(diagnostics.measure("truthPoints", () => 7)).toBe(7);
    expect(monotonicNow).not.toHaveBeenCalled();
    expect(cpuUsage).not.toHaveBeenCalled();
    expect(diagnostics.report()).toEqual({ enabled: false });
  });
});
