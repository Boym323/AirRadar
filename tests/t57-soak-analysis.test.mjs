import { describe, expect, it } from "vitest";
import { analyzeT57Soak, newT57Windows, projectT57SoakSample } from "../scripts/t57-soak-analysis.mjs";

const MiB = 1024 * 1024;
const epoch = Date.parse("2026-10-10T09:00:00Z");
const at = (minute) => new Date(epoch + minute * 60_000).toISOString();

function raw(minute = 0) {
  const member = (count) => ({ count, oldestAgeMs: 10000, staleRetained: 0, points: count,
    maxPointsPerAircraft: count });
  const status = {
    detailLevel: "admin", application: { version: "1.0.400", commit: "commit-t57" },
    runtime: {
      autocommitOperationAttribution: { processId: 1234, diagnosticsStoreId: "PRIVATE_STORE" },
      aircraftCount: 60, activeSseClients: 1,
      localTrailOverLimitAircraftCount: 0, networkTrailOverLimitAircraftCount: 0,
      diagnostics: {
        retentionAttribution: {
          scope: "process-local",
          aircraft: { local: member(20), network: member(40) },
          trails: { local: member(500), network: member(1000) },
          auxiliaryMaps: {
            sourcePreferences: 60, sourcePreferenceMissingSince: 0,
            lastHistorySample: 60, predictiveEvaluatedAt: 20,
            atcResolutionKeys: 30, atcShadowPredictionKeys: 10,
            SECRET_ID: "SHOULD_NOT_LEAK",
          },
          snapshotCacheEntries: 2, listeners: 1, secret: "SHOULD_NOT_LEAK",
        },
      },
    },
    secret: "SHOULD_NOT_LEAK",
  };
  const to = at(minute), from = at(minute - 1);
  const metrics = {
    schemaVersion: 2, scope: "process-local",
    runtime: {
      status: "enabled", rssBytes: (1400 + minute) * MiB,
      heapUsedBytes: (800 + minute) * MiB, heapTotalBytes: 1100 * MiB,
      externalBytes: 30 * MiB, cpuIntervalPercent: 55,
      majorGcCount: minute, v8HeapSpaces: [{ name: "old_space", usedBytes: 750 * MiB }],
      postMajorGc: { observedAtMs: epoch + minute * 60_000 - 2000,
        heapUsedBytes: (750 + minute) * MiB,
        oldSpaceUsedBytes: (650 + minute) * MiB,
        rssBytes: (1300 + minute) * MiB },
      eventLoopLagWindows: [{ from, to, p95Ms: 30, p99Ms: 150, maxMs: 250 }],
      secret: "SHOULD_NOT_LEAK",
    },
    hotPaths: [{
      name: "snapshot.trail-update", calls: 10, cpuMs: 30, waitMs: 5,
      windows: [{ from, to, calls: 10, cpuMs: 30, waitMs: 5, p99Ms: 15, p95Ms: 10 }],
    }, { name: "ICAO-ID-PRIVATE/SECRET", windows: [] }],
  };
  return { status, metrics };
}

function fixture(minute) {
  const { status, metrics } = raw(minute);
  return projectT57SoakSample(status, metrics, at(minute));
}

function records(count = 61) {
  const rows = [{ type: "header", schemaVersion: 1, seconds: (count - 1) * 60,
    intervalSeconds: 60, warmupSeconds: 0 }];
  const seen = new Map();
  for (let i = 0; i < count; i++) {
    const observation = fixture(i);
    rows.push({ type: "sample", value: newT57Windows({
      ...observation.sample, segment: 1,
    }, seen) });
  }
  return rows;
}

describe("T5.7C 24-hour read-only soak", () => {
  it("projects allowlisted diagnostics without raw IDs or private data", () => {
    const { status, metrics } = raw(1);
    const result = projectT57SoakSample(status, metrics, at(1));
    expect(result.identity.storeId).toBe("PRIVATE_STORE");
    expect(result.sample.retention.aircraft.local.count).toBe(20);
    expect(result.sample.hotPaths).toHaveLength(1);
    expect(result.sample.eventLoopWindows[0].p99Ms).toBe(150);
    expect(JSON.stringify(result.sample)).not.toContain("SHOULD_NOT_LEAK");
    expect(JSON.stringify(result.sample)).not.toContain("PRIVATE_STORE");
    expect(JSON.stringify(result.sample)).not.toContain("1234");
    expect(JSON.stringify(result.sample)).not.toContain("ICAO-ID-PRIVATE");
  });

  it("fails closed for absent runtime/retention/admin telemetry", () => {
    const { status, metrics } = raw(1);
    status.detailLevel = "public";
    expect(() => projectT57SoakSample(status, metrics)).toThrow("t57_admin_telemetry_unavailable");
    status.detailLevel = "admin";
    delete status.runtime.diagnostics.retentionAttribution;
    expect(() => projectT57SoakSample(status, metrics)).toThrow("t57_admin_telemetry_unavailable");
  });

  it("emits completed minute windows once, and never includes unfinished windows", () => {
    const cursors = new Map();
    const a = fixture(3).sample;
    const first = newT57Windows(a, cursors);
    const again = newT57Windows(a, cursors);
    expect(first.eventLoopWindows).toHaveLength(1);
    expect(first.hotPaths[0].windows).toHaveLength(1);
    expect(again.eventLoopWindows).toHaveLength(0);
    expect(again.hotPaths[0].windows).toHaveLength(0);
    const future = fixture(4).sample;
    future.at = at(3);
    expect(newT57Windows(future, cursors).eventLoopWindows).toHaveLength(0);
  });

  it("evaluates 60-second windows, retention and approximate post-major GC changes", () => {
    const result = analyzeT57Soak(records());
    expect(result.verdict).toBe("PASS_WITH_LIMITATIONS");
    expect(result.eventLoopWindows).toBe(61);
    expect(result.postMajorGcTrendMiB.oldSpace).toBe(59);
    expect(result.hotPathsByWindowCpuMs[0]).toMatchObject({
      name: "snapshot.trail-update", windows: 61, calls: 610, cpuMs: 1830,
    });
    expect(result.changesFirstLastDecile.networkAircraft).toBe(0);
    expect(JSON.stringify(result)).not.toContain("PRIVATE_STORE");
  });

  it("fails closed across process changes or incomplete windows", () => {
    const restarted = records();
    restarted[6].value.segment = 2;
    expect(analyzeT57Soak(restarted).verdict).toBe("INSUFFICIENT_EVIDENCE");
    const partial = records(6);
    expect(analyzeT57Soak(partial).verdict).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("reports limit breaches as failures without changing live retention", () => {
    const over = records();
    over[8].value.networkTrailOverLimitAircraft = 1;
    expect(analyzeT57Soak(over)).toMatchObject({ verdict: "FAIL", overLimit: true });
  });
});
