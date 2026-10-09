import { describe, expect, it } from "vitest";
import { navigationSample, metricDelta } from "../scripts/t53-navigation-production-sampler.mjs";

describe("T5.3 authorized navigation performance sampler", () => {
  const diagnostics = {
    observationsCreated: 50, persisted: 32, deduplicated: 12,
    navigationWriteMemo: {
      scope: "process-local", avoidedUpserts: 17,
      confirmedKeys: 21, inFlight: 0, ttlMs: 120000, maxKeys: 1024,
      dedupKey: "DO_NOT_DISCLOSE", aircraftHex: "SECRET_ICAO",
    },
    privateMessage: "DO_NOT_DISCLOSE",
  };
  const status = {
    detailLevel: "admin",
    application: { version: "1.0.388", commit: "abcdef1234" },
    runtime: {
      processRssBytes: 12345678, heapUsedBytes: 2000000,
      autocommitOperationAttribution: {
        processId: 321, diagnosticsStoreId: "diagnostics-stable",
        lanes: {
          "navigation.observation.create": {
            attempts: 80, successes: 78, failures: 2,
            windows: { "15m": { failureFamilies: {
              timeout: 1, constraint: 1, conflict: 0, connection: 0, other: 0, unknown: 0,
            } } },
          },
        },
      },
    },
  };

  it("projects bounded aggregate metrics, without aircraft identifiers or credentials", () => {
    const result = navigationSample(diagnostics, status, {
      phases: { "health.total": { p95Ms: 44 } },
      runtime: { rssBytes: 11111, heapUsedBytes: 22222, eventLoopLagP95Ms: 3 },
    });
    expect(result.memo).toEqual({
      avoidedUpserts: 17, confirmedKeys: 21, inFlight: 0, ttlMs: 120000, maxKeys: 1024,
    });
    expect(result.dbLane).toMatchObject({ attempts: 80, successes: 78, failures: 2 });
    expect(result.diagnosticProcess).toBe(321);
    expect(result.diagnosticStoreId).toBe("diagnostics-stable");
    expect(result.runtime.rssBytes).toBe(11111);
    expect(JSON.stringify(result)).not.toContain("DO_NOT_DISCLOSE");
    expect(JSON.stringify(result)).not.toContain("SECRET_ICAO");
  });

  it("reports deltas only for available non-decreasing numeric counters", () => {
    const first = { memo: { avoidedUpserts: 10, confirmedKeys: 5 } };
    const later = { memo: { avoidedUpserts: 34, confirmedKeys: 2 } };
    expect(metricDelta(first, later, ["memo", "avoidedUpserts"])).toBe(24);
    expect(metricDelta(first, later, ["memo", "confirmedKeys"])).toBeNull();
    expect(metricDelta(first, {}, ["memo", "avoidedUpserts"])).toBeNull();
  });

  it("does not assume that unavailable DB attribution is a successful measurement", () => {
    const result = navigationSample({ navigationWriteMemo: { scope: "process-local", avoidedUpserts: 0 } }, {}, {});
    expect(result.dbLane.attempts).toBeNull();
    expect(result.dbLane.failures).toBeNull();
    expect(result.diagnosticProcess).toBeNull();
  });
});
