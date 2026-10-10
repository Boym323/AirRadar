import { describe, expect, it } from "vitest";
import { analyzeT55Samples, delta, pearson, projectT55Sample } from "../scripts/t55-runtime-analysis.mjs";

function rawSample(time = "2026-10-10T07:00:00.000Z") {
  return projectT55Sample({
    detailLevel: "admin",
    application: { commit: "aabbccddeeff", version: "1.0.390" },
    runtime: {
      aircraftCount: 35, activeSseClients: 3, listenerCount: 5,
      localTrailPointCount: 1200, networkTrailPointCount: 500,
      autocommitOperationAttribution: {
        processId: 4321, diagnosticsStoreId: "stable-store",
        lanes: { "navigation.observation.create": { attempts: 125, failures: 0 } },
      },
      rawSecret: "DO_NOT_DISCLOSE",
    },
  }, {
    schemaVersion: 2, scope: "process-local",
    runtime: {
      status: "enabled", cpuIntervalPercent: 52,
      cpuUserTimeMs: 120000, cpuSystemTimeMs: 3500,
      rssBytes: 1073741824, heapUsedBytes: 640 * 1048576, heapTotalBytes: 1024 * 1048576,
      externalBytes: 50 * 1048576, arrayBuffersBytes: 12 * 1048576,
      eventLoopLagP50Ms: 19, eventLoopLagP95Ms: 24, eventLoopLagP99Ms: 40,
      gcCount: 25, gcTotalPauseMs: 300, gcMaxPauseMs: 23,
    },
    hotPaths: [
      { name: "source.merge", calls: 5, totalMs: 30, p95Ms: 5, processedAircraft: 400,
        response: { secret: "DO_NOT_DISCLOSE" } },
      { name: "../../malicious", calls: 50, totalMs: 999 },
    ],
    secret: "DO_NOT_DISCLOSE",
  }, time);
}

describe("T5.5 runtime production audit projections", () => {
  it("projects only aggregate, finite, bounded runtime values", () => {
    const result = rawSample();
    expect(result).toMatchObject({
      cpuPercent: 52, rssBytes: 1073741824, gcCount: 25,
      aircraftCount: 35, sseClients: 3, navigationFailures: 0,
      commit: "aabbccddeeff", storeId: "stable-store", pid: 4321,
    });
    expect(result.hotPaths).toEqual([{ name: "source.merge", calls: 5,
      totalMs: 30, p95Ms: 5, processedAircraft: 400 }]);
    expect(JSON.stringify(result)).not.toContain("DO_NOT_DISCLOSE");
    expect(JSON.stringify(result)).not.toContain("../../malicious");
  });

  it("fails closed when schema, authorization, or enabled runtime metrics are absent", () => {
    expect(() => projectT55Sample({}, { schemaVersion: 1 })).toThrow("t55_runtime_diagnostics_unavailable");
    expect(() => projectT55Sample({}, { schemaVersion: 2, scope: "process-local", runtime: { status: "enabled" } }))
      .toThrow("t55_admin_projection_required");
    expect(() => projectT55Sample({ detailLevel: "admin" }, { schemaVersion: 2, scope: "process-local",
      runtime: { status: "disabled" } })).toThrow("t55_runtime_diagnostics_unavailable");
  });

  it("summarizes a stable 30-minute sample window without claiming CPU hotspot attribution", () => {
    const rows = [];
    const start = Date.parse("2026-10-10T07:00:00.000Z");
    for (let i = 0; i <= 60; i++) {
      const time = new Date(start + i * 30000).toISOString();
      const snapshot = rawSample(time);
      snapshot.cpuPercent = 40 + i / 4;
      snapshot.cpuUserMs = 120000 + i * 15000;
      snapshot.cpuSystemMs = 3500 + i * 1000;
      snapshot.gcPauseMs = 300 + i * 4;
      snapshot.gcCount = 25 + i;
      snapshot.aircraftCount = 20 + i;
      snapshot.navigationAttempts = 125 + 3 * i;
      snapshot.rssBytes = 1073741824 + i * 1024 * 1024;
      snapshot.hotPaths[0].calls = 5 + 2 * i;
      snapshot.hotPaths[0].totalMs = 30 + 40 * i;
      rows.push(snapshot);
    }
    const summary = analyzeT55Samples(rows);
    expect(summary.verdict).toBe("DIAGNOSTICS_PASS_NOT_OPTIMIZATION_PROOF");
    expect(summary.stableProcessAndCommit).toBe(true);
    expect(summary.samples).toBe(61);
    expect(summary.elapsedSeconds).toBe(1800);
    expect(summary.gc.eventsDelta).toBe(60);
    expect(summary.gc.pauseMsDelta).toBe(240);
    expect(summary.cpu.coreEquivalentPercent).toBeCloseTo(53.333, 2);
    expect(summary.load.dbAttemptsDelta).toBe(180);
    expect(summary.hotPathsByInstrumentedWallMs).toMatchObject([
      { name: "source.merge", calls: 120, wallMs: 2400, intervals: 60 },
    ]);
    expect(summary.correlations.cpuVsAircraft).toBeCloseTo(1, 3);
    expect(summary.caveats.join(" ")).toContain("not CPU attribution");
  });

  it("rejects cross-process counter arithmetic and handles missing data", () => {
    const first = rawSample();
    const last = rawSample("2026-10-10T07:30:00.000Z");
    last.pid = 4322;
    const result = analyzeT55Samples([first, last]);
    expect(result.stableProcessAndCommit).toBe(false);
    expect(result.cpu.coreEquivalentPercent).toBeNull();
    expect(result.gc.eventsDelta).toBeNull();
    expect(result.verdict).toBe("PASS_WITH_LIMITATIONS");
    expect(delta(30, 20)).toBeNull();
    expect(delta(null, 20)).toBeNull();
    expect(pearson(Array(10).fill(0), Array(10).fill(20))).toBeNull();
  });
});
