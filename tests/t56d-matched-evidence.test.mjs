import { describe, expect, it } from "vitest";
import { compareT56MemoryReports } from "../scripts/t56d-matched-evidence.mjs";

const MiB = 1024 * 1024;
const start = Date.parse("2026-10-10T00:00:00.000Z");
function report(options = {}) {
  const {
    commit = "before-sha", rss = 700, aircraft = 80,
    localPoints = 500, networkPoints = 2500,
    sseClients = 0, sseClientMax = sseClients, breach = 0,
  } = options;
  const rows = Array.from({ length: 61 }, (_, i) => {
    const at = start + i * 30_000;
    return {
      at: new Date(at).toISOString(),
      commit, version: commit, pid: 123,
      storeId: "PRIVATE_STORE_IDENTIFIER",
      rssBytes: (rss + i / 10) * MiB,
      heapUsedBytes: (350 + i / 20) * MiB,
      heapTotalBytes: 600 * MiB,
      externalBytes: 30 * MiB,
      arrayBuffersBytes: 10 * MiB,
      spaces: [{ name: "old_space", usedBytes: 280 * MiB }],
      postMajorGc: {
        observedAtMs: at - 1000,
        heapUsedBytes: (310 + i / 15) * MiB,
        oldSpaceUsedBytes: (270 + i / 15) * MiB,
        rssBytes: (rss + i / 10) * MiB,
      },
      localTrailPoints: localPoints,
      networkTrailPoints: networkPoints,
      localTrailAircraft: 20,
      networkTrailAircraft: 60,
      localTrailMaxPerAircraft: 400,
      networkTrailMaxPerAircraft: 100,
      localTrailAtLimitAircraft: 0,
      networkTrailAtLimitAircraft: 0,
      localTrailOverLimitAircraft: breach,
      networkTrailOverLimitAircraft: 0,
      aircraftCount: aircraft,
      sseClients: i === 0 ? sseClientMax : sseClients,
    };
  });
  return { schemaVersion: 1, warmupSeconds: 0, rows, unavailable: [], summary: { verdict: "DO_NOT_TRUST" } };
}

describe("T5.6D offline matched comparison", () => {
  it("compares matched stable evidence without claiming optimization or leaking store IDs", () => {
    const result = compareT56MemoryReports(
      report(), report({ commit: "after-sha", rss: 680 }),
    );
    expect(result.verdict).toBe("MATCHED_OBSERVATIONAL_ONLY");
    expect(result.reasons).toEqual([]);
    expect(result.observedAfterMinusBeforeMiB.rssP50).toBe(-20);
    expect(JSON.stringify(result)).not.toContain("PRIVATE_STORE_IDENTIFIER");
    expect(JSON.stringify(result)).not.toContain("before-sha");
  });

  it("rejects changed aircraft/trail workload and SSE fanout instead of overstating a delta", () => {
    const mismatched = compareT56MemoryReports(
      report(), report({ commit: "after-sha", aircraft: 200, networkPoints: 6000, sseClients: 5, sseClientMax: 5 }),
    );
    expect(mismatched.verdict).toBe("INCOMPARABLE");
    expect(mismatched.reasons).toContain("aircraft_load_mismatch");
    expect(mismatched.reasons).toContain("networkTrails_load_mismatch");
    expect(mismatched.reasons).toContain("sseClients_zero_mismatch");
  });

  it("rejects any over-limit trail, missing data or identical commit", () => {
    const invalid = report({ commit: "after-sha", breach: 1 });
    invalid.unavailable.push({ at: new Date(start).toISOString() });
    const result = compareT56MemoryReports(report(), invalid);
    expect(result.verdict).toBe("INCOMPARABLE");
    expect(result.reasons).toContain("trail_bound_violation_or_missing");
    expect(result.reasons).toContain("after_insufficient_evidence");
    expect(compareT56MemoryReports(report(), report()).reasons)
      .toContain("distinct_commits_required");
  });

  it("validates chronological samples and rejects misleading embedded summaries", () => {
    const invalid = report();
    invalid.rows[10].at = invalid.rows[9].at;
    expect(() => compareT56MemoryReports(invalid, report({ commit: "after-sha" })))
      .toThrow("invalid_t56_sample_order");

    const a = report(); a.summary.verdict = "FAILED";
    expect(compareT56MemoryReports(a, report({ commit: "after-sha" })).verdict)
      .toBe("MATCHED_OBSERVATIONAL_ONLY");
  });
});
