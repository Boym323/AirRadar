import { describe, expect, it } from "vitest";
import { runTrackFusionTrial, type FusionScenario } from "@/scripts/benchmark-twin-fusion";

const caseStudy: FusionScenario = {
  aircraft: 36, cycles: 15, overlapPercent: 75, dirtyStride: 4, kind: "handover",
};

describe("Twin / Track Fusion benchmark harness", () => {
  it("replays handovers deterministically and never measures nonfinite latency", async () => {
    const reference = await runTrackFusionTrial(caseStudy);
    const second = await runTrackFusionTrial(caseStudy);
    expect(second.semanticDigest).toBe(reference.semanticDigest);
    expect(second.stats).toEqual(reference.stats);
    expect(reference.stats.activeTracks).toBe(36);
    expect(reference.stats.fullPasses).toBe(3);
    expect(reference.stats.changedIdentities).toBeGreaterThan(36);
    expect(reference.metrics.p99Ms).toBeGreaterThanOrEqual(reference.metrics.p50Ms);
    expect(reference.metrics.cpuMs).toBeGreaterThanOrEqual(0);
  });

  it("runs the dirty-identity path and changes overlap counts", async () => {
    const reference = await runTrackFusionTrial({ ...caseStudy, kind: "steady" });
    const handover = await runTrackFusionTrial(caseStudy);
    expect(reference.semanticDigest).not.toBe(handover.semanticDigest);
    expect(reference.stats.evaluated).toBeGreaterThan(0);
    expect(handover.stats.evaluated).toBeGreaterThan(0);
  });

  it("rejects unbounded or invalid benchmark input", async () => {
    await expect(runTrackFusionTrial({ ...caseStudy, aircraft: 50_000 })).rejects.toThrow("invalid_bounded_fusion_scenario");
    await expect(runTrackFusionTrial({ ...caseStudy, cycles: 0 })).rejects.toThrow("invalid_bounded_fusion_scenario");
  });
});
