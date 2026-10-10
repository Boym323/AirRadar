import { describe, expect, it } from "vitest";
import { analyzeT56Samples, projectT56Sample } from "../scripts/t56-memory-analysis.mjs";

const MB = 1024 * 1024;
const start = Date.parse("2026-10-10T08:00:00Z");
function sample(i, opts = {}) {
  const at = new Date(start + i * 30000).toISOString();
  const gcTime = i >= 30 ? start + i * 30000 - 3000 : null;
  const status = {
    detailLevel: "admin", application: { commit: "production-sha", version: "1.0.392" },
    runtime: {
      localTrailPointCount: i * 10,
      networkTrailPointCount: 300 + i * 25,
      localTrailAircraftCount: 20, networkTrailAircraftCount: 40,
      aircraftCount: 60, activeSseClients: 0,
      autocommitOperationAttribution: { processId: 1234, diagnosticsStoreId: "same-store" },
      secret: "NEVER_PROJECT",
    },
  };
  const metrics = {
    schemaVersion: 2, scope: "process-local",
    runtime: {
      status: "enabled",
      rssBytes: (900 + i) * MB, heapUsedBytes: (500 + i) * MB,
      heapTotalBytes: 900 * MB, externalBytes: 20 * MB, arrayBuffersBytes: 5 * MB,
      majorGcCount: i,
      postMajorGc: gcTime === null ? null : {
        observedAtMs: gcTime,
        heapUsedBytes: (400 + i) * MB,
        rssBytes: (800 + i) * MB,
        oldSpaceUsedBytes: (350 + i) * MB,
        arbitraryUserData: "NEVER_PROJECT",
      },
      v8HeapSpaces: [
        { name: "old_space", usedBytes: (300 + i) * MB, sizeBytes: 600 * MB, physicalBytes: 500 * MB },
        { name: "../../secret", usedBytes: 1, userData: "NEVER_PROJECT" },
      ],
      secret: "NEVER_PROJECT",
    },
  };
  return projectT56Sample(status, metrics, at);
}

describe("T5.6 memory projection and read-only trend analysis", () => {
  it("projects only finite, bounded heap-space and trail totals", () => {
    const projected = sample(36);
    expect(projected.spaces).toHaveLength(1);
    expect(projected.spaces[0].name).toBe("old_space");
    expect(projected.postMajorGc.oldSpaceUsedBytes).toBe(386 * MB);
    expect(projected.networkTrailPoints).toBe(1200);
    expect(JSON.stringify(projected)).not.toContain("NEVER_PROJECT");
    expect(JSON.stringify(projected)).not.toContain("../../secret");
  });

  it("fails closed for public, older-schema and disabled observations", () => {
    expect(() => projectT56Sample({}, {})).toThrow("t56_memory_diagnostics_unavailable");
    expect(() => projectT56Sample({ detailLevel: "public" },
      { schemaVersion: 2, scope: "process-local", runtime: { status: "enabled", v8HeapSpaces: [] } }))
      .toThrow("t56_admin_projection_required");
  });

  it("separates warmup and independent major-GC baselines", () => {
    const rows = Array.from({ length: 121 }, (_, i) => sample(i));
    const report = analyzeT56Samples(rows, [], 600);
    expect(report.verdict).toBe("PASS_WITH_LIMITATIONS");
    expect(report.elapsedSeconds).toBe(3600);
    expect(report.steadyStateSamples).toBe(101);
    expect(report.majorGcBaselines).toBe(91);
    expect(report.postMajorGcTrendMiB.heapUsed).toBe(90);
    expect(report.v8SpacesUsedMiB.oldSpace).not.toBeNull();
    expect(report.caveats.join(" ")).toContain("not proof of a leak");
  });

  it("does not claim stable evidence across process restarts or absent GC", () => {
    const rows = Array.from({ length: 61 }, (_, i) => sample(i));
    rows[30].pid = 4321;
    expect(analyzeT56Samples(rows, [], 0).stableProcessAndCommit).toBe(false);
    expect(analyzeT56Samples(rows, [], 0).verdict).toBe("INSUFFICIENT_EVIDENCE");
    const noGc = Array.from({ length: 61 }, (_, i) => {
      const s = sample(i); s.postMajorGc = null; return s;
    });
    expect(analyzeT56Samples(noGc, [], 0).postMajorGcTrendMiB.heapUsed).toBeNull();
    expect(analyzeT56Samples(noGc, [], 0).verdict).toBe("INSUFFICIENT_EVIDENCE");
  });
});
