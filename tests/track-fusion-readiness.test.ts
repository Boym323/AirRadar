import { describe, expect, it } from "vitest";
import {
  TrackFusionReadinessMonitor,
  evaluateTrackFusionReadiness,
  type TrackFusionReadinessEvidence,
} from "@/lib/track-fusion";
import type { TrackFusionShadowDiagnostics } from "@/lib/track-fusion";

const base = Date.parse("2026-10-05T08:00:00.000Z");

function evidence(overrides: Partial<TrackFusionReadinessEvidence> = {}): TrackFusionReadinessEvidence {
  return {
    window: {
      from: "2026-10-05T06:00:00.000Z",
      to: "2026-10-05T08:00:00.000Z",
      spanMinutes: 120,
      bucketMinutes: 5,
      buckets: 24,
      processLocal: true,
    },
    evaluations: 6_000,
    positionComparisons: 500,
    positionDisagreements: 5,
    positionResidualP95Nm: 0.5,
    positionDisagreementRate: 0.01,
    sourceTransitions: 20,
    acceptedSourceTransitions: 18,
    rejectedSourceTransitions: 2,
    rejectedTransitionRate: 0.1,
    estimatedGapFills: 120,
    estimatedGapFillRate: 0.02,
    canonicalPositionComparisons: 5_000,
    canonicalPositionDivergences: 50,
    canonicalDivergenceRate: 0.01,
    capacityEvictions: 0,
    ...overrides,
  };
}

function diagnostics(input: Partial<TrackFusionShadowDiagnostics> & {
  histogram?: number[];
} = {}): TrackFusionShadowDiagnostics {
  const histogram = input.histogram ?? [0, 0, 0, 0, 0, 0, 0, 0];
  return {
    version: "track-fusion-shadow-v1",
    enabled: true,
    evaluatedTracks: 0,
    activeTracks: 0,
    overlapTracks: 0,
    goodTracks: 0,
    degradedTracks: 0,
    estimatedTracks: 0,
    noPositionTracks: 0,
    capacityEvictions: 0,
    evaluations: 0,
    dedupedEvaluations: 0,
    positionComparisons: 0,
    positionDisagreements: 0,
    estimatedGapFills: 0,
    acceptedSourceTransitions: 0,
    rejectedSourceTransitions: 0,
    canonicalPositionComparisons: 0,
    canonicalPositionDivergences: 0,
    fieldSelections: {
      position: { local: 0, network: 0, estimated: 0 },
      altitude: { local: 0, network: 0, estimated: 0 },
      groundSpeed: { local: 0, network: 0, estimated: 0 },
      track: { local: 0, network: 0, estimated: 0 },
      verticalRate: { local: 0, network: 0, estimated: 0 },
    },
    positionResidualNm: {
      average: null,
      maximum: null,
      p95UpperBound: null,
      histogram: [
        { upperBoundNm: 0.1, count: histogram[0] ?? 0 },
        { upperBoundNm: 0.25, count: histogram[1] ?? 0 },
        { upperBoundNm: 0.5, count: histogram[2] ?? 0 },
        { upperBoundNm: 1, count: histogram[3] ?? 0 },
        { upperBoundNm: 2, count: histogram[4] ?? 0 },
        { upperBoundNm: 5, count: histogram[5] ?? 0 },
        { upperBoundNm: 10, count: histogram[6] ?? 0 },
        { upperBoundNm: null, count: histogram[7] ?? 0 },
      ],
    },
    canonicalResidualNm: { average: null, maximum: null },
    lastEvaluatedAt: null,
    recentDisagreements: [],
    ...input,
  };
}

describe("Track Fusion Readiness V1", () => {
  it("returns WAIT until process-local evidence is complete", () => {
    const report = evaluateTrackFusionReadiness(evidence({
      window: {
        from: "2026-10-05T07:30:00.000Z",
        to: "2026-10-05T08:00:00.000Z",
        spanMinutes: 30,
        bucketMinutes: 5,
        buckets: 6,
        processLocal: true,
      },
      evaluations: 900,
    }), true, { digitalTwinConfigured: true });

    expect(report.decision).toBe("WAIT");
    expect(report.reasons).toEqual(expect.arrayContaining([
      "process_window_insufficient",
      "evaluations_insufficient",
    ]));
    expect(report.rollout.digitalTwinEffective).toBe(false);
  });

  it("returns FAIL only after sufficient evidence reveals quality violations", () => {
    const report = evaluateTrackFusionReadiness(evidence({
      positionResidualP95Nm: 2,
      positionDisagreementRate: 0.08,
      rejectedTransitionRate: 0.4,
      canonicalDivergenceRate: 0.08,
    }), true, { digitalTwinConfigured: true });

    expect(report.complete).toBe(true);
    expect(report.decision).toBe("FAIL");
    expect(report.reasons).toEqual(expect.arrayContaining([
      "position_residual_p95_high",
      "position_disagreement_rate_high",
      "rejected_transition_rate_high",
      "canonical_divergence_rate_high",
    ]));
    expect(report.rollout.digitalTwinEffective).toBe(false);
  });

  it("returns PASS and enables Digital Twin only with explicit rollout configuration", () => {
    const disabled = evaluateTrackFusionReadiness(evidence(), true);
    expect(disabled.decision).toBe("PASS");
    expect(disabled.rollout.digitalTwinEffective).toBe(false);

    const enabled = evaluateTrackFusionReadiness(evidence(), true, { digitalTwinConfigured: true });
    expect(enabled.decision).toBe("PASS");
    expect(enabled.rollout.digitalTwinEffective).toBe(true);
  });

  it("aggregates bounded process-local deltas and derives p95 from the histogram", () => {
    const monitor = new TrackFusionReadinessMonitor();
    monitor.observe(diagnostics(), base);

    monitor.observe(diagnostics({
      evaluations: 6_000,
      positionComparisons: 500,
      positionDisagreements: 5,
      estimatedGapFills: 100,
      acceptedSourceTransitions: 18,
      rejectedSourceTransitions: 2,
      canonicalPositionComparisons: 5_000,
      canonicalPositionDivergences: 50,
      histogram: [20, 180, 250, 50, 0, 0, 0, 0],
    }), base + 120 * 60_000);

    const report = monitor.report(true, {
      now: new Date(base + 121 * 60_000),
      digitalTwinConfigured: true,
    });
    expect(report.evidence.window.processLocal).toBe(true);
    expect(report.evidence.window.spanMinutes).toBe(121);
    expect(report.evidence.positionResidualP95Nm).toBe(1);
    expect(report.decision).toBe("PASS");
    expect(report.rollout.digitalTwinEffective).toBe(true);
  });

  it("resets evidence if cumulative shadow counters move backwards", () => {
    const monitor = new TrackFusionReadinessMonitor();
    monitor.observe(diagnostics(), base);
    monitor.observe(diagnostics({
      evaluations: 6_000,
      positionComparisons: 500,
      acceptedSourceTransitions: 20,
      canonicalPositionComparisons: 5_000,
      histogram: [20, 180, 250, 50, 0, 0, 0, 0],
    }), base + 120 * 60_000);

    monitor.observe(diagnostics({ evaluations: 1 }), base + 121 * 60_000);
    const report = monitor.report(true, { now: new Date(base + 122 * 60_000) });
    expect(report.decision).toBe("WAIT");
    expect(report.evidence.evaluations).toBe(0);
    expect(report.evidence.window.spanMinutes).toBe(1);
  });
});
