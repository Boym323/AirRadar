import { describe, expect, it } from "vitest";
import { analyzeT57Soak, newT57Windows, projectT57SoakSample } from "../scripts/t57-soak-analysis.mjs";
import { verifyT57ExpectedCommit } from "../scripts/t57-production-soak.mjs";
import { classifyT57Failure } from "../scripts/t57-production-soak.mjs";

const MiB = 1024 * 1024;
const epoch = Date.parse("2026-10-10T09:00:00Z");
const at = (minute) => new Date(epoch + minute * 60_000).toISOString();

describe("T5.7C preflight commit identity", () => {
  it("accepts a full SHA or approved prefix and fails closed on a different production build", () => {
    const sha = "fb61c491bc44da7891d988037401193ce4579bb3";
    expect(() => verifyT57ExpectedCommit(sha, sha)).not.toThrow();
    expect(() => verifyT57ExpectedCommit(sha, "fb61c491")).not.toThrow();
    expect(() => verifyT57ExpectedCommit(sha, "0dd31137")).toThrow("unexpected_production_commit");
  });
});

describe("T5.7C sanitized sample failure categories", () => {
  it("classifies common poll failures without retaining messages", () => {
    expect(classifyT57Failure(new Error("Diagnostic request /api/system/status HTTP 401"))).toBe("authentication_failure");
    const timeout = new Error("The operation was aborted");
    timeout.name = "TimeoutError";
    expect(classifyT57Failure(timeout)).toBe("http_timeout");
    expect(classifyT57Failure(new TypeError("fetch failed"))).toBe("network_failure");
    expect(classifyT57Failure(new Error("t57_required_diagnostic_missing"))).toBe("response_validation_failure");
  });
});

function raw(minute = 0) {
  const member = (count) => ({ count, oldestAgeMs: 10000, staleRetained: 0, points: count,
    maxPointsPerAircraft: count });
  const status = {
    detailLevel: "admin", application: { version: "1.0.400", commit: "commit-t57" },
    runtime: {
      autocommitOperationAttribution: { processId: 1234, diagnosticsStoreId: "PRIVATE_STORE" },
      aircraftCount: 60, activeSseClients: 1,
      localTrailOverLimitAircraftCount: 0, networkTrailOverLimitAircraftCount: 0,
      // Production /api/system/status puts retentionAttribution directly in runtime.
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
    metrics.schemaVersion = 3;
    metrics.operationalTwinForensics = {
      enabled: true,
      phases: { truthPoints: { calls: 100, sampledCalls: 10, sampledCpuMs: 4, sampledWallMs: 5,
        estimatedCpuMs: 40, estimatedWallMs: 50, sampleP50Ms: 0.5, sampleP95Ms: 1, sampleP99Ms: 1.2, sampleMaxMs: 2 } },
      windows: [{ from: at(0), to: at(1), phases: { truthPoints: { calls: 10, sampledCalls: 1,
        estimatedCpuMs: 5, estimatedWallMs: 6, sampleP95Ms: 1, sampleP99Ms: 1.2, sampleMaxMs: 2 } },
        counters: { captures: 1, privateIcao: "SHOULD_NOT_LEAK" } }],
      counters: { captures: 1, privateIcao: "SHOULD_NOT_LEAK" },
      privateAircraftData: "SHOULD_NOT_LEAK",
    };
    const result = projectT57SoakSample(status, metrics, at(1));
    expect(result.identity.storeId).toBe("PRIVATE_STORE");
    expect(result.sample.retention.aircraft.local.count).toBe(20);
    expect(result.sample.hotPaths).toHaveLength(1);
    expect(result.sample.eventLoopWindows[0].p99Ms).toBe(150);
    expect(result.sample.operationalTwinForensics.enabled).toBe(true);
    expect(result.sample.operationalTwinForensics.phases.truthPoints.calls).toBe(100);
    expect(JSON.stringify(result.sample)).not.toContain("SHOULD_NOT_LEAK");
    expect(JSON.stringify(result.sample)).not.toContain("PRIVATE_STORE");
    expect(JSON.stringify(result.sample)).not.toContain("1234");
    expect(JSON.stringify(result.sample)).not.toContain("ICAO-ID-PRIVATE");
  });

  it("preserves bounded V5 SQL settlement and event-loop evidence without raw route data", () => {
    const { status, metrics } = raw(1);
    status.routeEnrichment = {
      phases: {
        dbCallSettlement: { measured: true, count: 3, sampleCount: 3, p50Ms: 500, p95Ms: 2100, p99Ms: 2100, maxMs: 2100 },
        dbReadSettlement: { measured: true, count: 1, sampleCount: 1, p50Ms: 2100, p95Ms: 2100, p99Ms: 2100, maxMs: 2100 },
        dbWriteSettlement: { measured: true, count: 1, sampleCount: 1, p50Ms: 5, p95Ms: 5, p99Ms: 5, maxMs: 5 },
        dbMaintenanceSettlement: { measured: true, count: 1, sampleCount: 1, p50Ms: 35, p95Ms: 35, p99Ms: 35, maxMs: 35, errors: 1 },
        dbMaintenanceCount: { measured: true, count: 1, sampleCount: 1, p50Ms: 35, p95Ms: 35, p99Ms: 35, maxMs: 35, errors: 1 },
        dbMaintenancePrune: { measured: false, count: 0, sampleCount: 0, p50Ms: null, p95Ms: null, p99Ms: null, maxMs: null, errors: 0 },
        dbLateSettlement: { measured: true, count: 1, sampleCount: 1, p50Ms: 1350, p95Ms: 1350, p99Ms: 1350, maxMs: 1350 },
        callerTimeoutOvershoot: { measured: true, count: 1, sampleCount: 1, p50Ms: 700, p95Ms: 700, p99Ms: 700, maxMs: 700 },
      },
      sql: {
        callerTimeouts: 1,
        completedAfterCallerTimeout: 1,
        eventLoopAtTimeout: { sampleCount: 1, p50Percent: 92, p95Percent: 92, p99Percent: 92 },
      },
      secret: "SHOULD_NOT_LEAK",
    };
    const projected = projectT57SoakSample(status, metrics, at(1)).sample;
    expect(projected.routeCache.phases.callerTimeoutOvershoot.p95Ms).toBe(700);
    expect(projected.routeCache.phases.dbCallSettlement.p99Ms).toBe(2100);
    expect(projected.routeCache.phases.dbReadSettlement.p95Ms).toBe(2100);
    expect(projected.routeCache.phases.dbWriteSettlement.p95Ms).toBe(5);
    expect(projected.routeCache.phases.dbMaintenanceSettlement.errors).toBe(1);
    expect(projected.routeCache.phases.dbMaintenanceCount.errors).toBe(1);
    expect(projected.routeCache.sql.eventLoopAtTimeout.p95Percent).toBe(92);
    expect(JSON.stringify(projected)).not.toContain("SHOULD_NOT_LEAK");

    const stream = records();
    for (const row of stream) if (row.type === "sample") row.value.routeCache = projected.routeCache;
    const report = analyzeT57Soak(stream);
    expect(report.routeCache.phaseLatencyMs.callerTimeoutOvershoot.measured).toBe(true);
    expect(report.routeCache.phaseLatencyMs.dbReadSettlement.measured).toBe(true);
    expect(report.routeCache.phaseLatencyMs.dbWriteSettlement.measured).toBe(true);
    expect(report.routeCache.phaseLatencyMs.dbMaintenanceSettlement.measured).toBe(true);
    expect(report.routeCache.eventLoopAtTimeout.p95Percent.p50).toBe(92);
    expect(report.routeCache.eventLoopAtTimeout.scope).toBe("process-local-recent-samples");
  });

  it("fails closed for absent runtime/retention/admin telemetry", () => {
    const { status, metrics } = raw(1);
    status.detailLevel = "public";
    expect(() => projectT57SoakSample(status, metrics)).toThrow("t57_admin_telemetry_unavailable");
    status.detailLevel = "admin";
    delete status.runtime.retentionAttribution;
    expect(() => projectT57SoakSample(status, metrics)).toThrow("t57_admin_telemetry_unavailable");
  });

  it("rejects the old nested contract and accepts the flattened admin runtime contract", () => {
    const { status, metrics } = raw(1);
    const validRetention = status.runtime.retentionAttribution;
    delete status.runtime.retentionAttribution;
    status.runtime.diagnostics = { retentionAttribution: validRetention };
    expect(() => projectT57SoakSample(status, metrics, at(1)))
      .toThrow("t57_admin_telemetry_unavailable");
    // Keep the legacy decoy: the valid source must be the actual API path.
    status.runtime.retentionAttribution = validRetention;
    const projection = projectT57SoakSample(status, metrics, at(1));
    expect(projection.sample.retention.aircraft.network.count).toBe(40);
    expect(projection.sample.retention.trails.network.points).toBe(1000);
    expect(JSON.stringify(projection.sample)).not.toContain("SHOULD_NOT_LEAK");
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

  it("keeps Twin validator windows even when the top hot paths exclude them", () => {
    const { status, metrics } = raw(1);
    metrics.validatorPaths = [
      "twin.outcome.truth", "twin.trajectoryQuality.truth",
      "twin.trajectoryQualityV2.truth", "twin.eventOutcome.local",
      "twin.regionalAttention.truth",
    ].map((name) => ({
      name, calls: 1, cpuMs: 0.5, waitMs: 0,
      windows: [{ from: at(0), to: at(1), calls: 1, cpuMs: 0.5,
        waitMs: 0, p95Ms: 0.5, p99Ms: 0.5 }],
    }));
    const sample = projectT57SoakSample(status, metrics, at(1)).sample;
    for (const path of metrics.validatorPaths) {
      expect(sample.hotPaths.some((value) => value.name === path.name)).toBe(true);
    }
    const stream = records(61);
    for (const entry of stream) {
      if (entry.type === "sample") {
        entry.value.hotPaths.push(...sample.hotPaths.filter((p) => p.name.startsWith("twin.")));
      }
    }
    const result = analyzeT57Soak(stream);
    expect(result.hotPathsByWindowCpuMs.filter((p) => p.name.startsWith("twin."))).toHaveLength(5);
  });

  it("reports limit breaches as failures without changing live retention", () => {
    const over = records();
    over[8].value.networkTrailOverLimitAircraft = 1;
    expect(analyzeT57Soak(over)).toMatchObject({ verdict: "FAIL", overLimit: true });
  });
});
