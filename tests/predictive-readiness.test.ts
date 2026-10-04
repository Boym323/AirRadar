import { describe, expect, it } from "vitest";
import {
  evaluatePredictiveReadiness,
  PREDICTIVE_READINESS_THRESHOLDS,
  type PredictiveReadinessEvidence,
} from "@/lib/predictive-intelligence/readiness";
import { enforcePredictiveReadiness } from "@/lib/server/predictive-readiness";

function goodEvidence(): PredictiveReadinessEvidence {
  return {
    ETA: {
      observations: 160,
      scoreableObservations: 140,
      independentTruthFlights: 80,
      medianAbsoluteErrorSeconds: 180,
      p90AbsoluteErrorSeconds: 420,
      p95AbsoluteErrorSeconds: 720,
      captureStaleRate: 0.01,
    },
    RUNWAY: {
      observations: 140,
      scoreableObservations: 100,
      independentTruthFlights: 75,
      exactEndAccuracy: 0.91,
      coverage: 0.71,
      captureStaleRate: 0.01,
    },
    RUNWAY_CHANGE: {
      observations: 60,
      scoreableObservations: 40,
      independentTruthFlights: 30,
      outcomePrecision: 0.9,
      falsePositiveRate: 0.1,
      independentChangeTruthAvailable: false,
      captureStaleRate: 0.01,
    },
    TRAJECTORY: {
      observations: 180,
      candidateObservations: null,
      validatedCandidates: 0,
      precision: null,
      stateCaptureAvailable: false,
      independentOutcomeTruthAvailable: false,
      captureStaleRate: 0.01,
    },
    integrity: {
      crossIcaoLifecycleConflicts: 0,
      crossFlightLifecycleConflicts: 0,
    },
  };
}

describe("Predictive Graduation Readiness V1", () => {
  it("passes capabilities only when both evidence volume and quality thresholds pass", () => {
    const evaluation = evaluatePredictiveReadiness(goodEvidence());

    expect(evaluation.thresholdVersion).toBe("predictive-readiness-v1");
    expect(evaluation.capabilities.ETA).toMatchObject({ decision: "PASS", reasons: [] });
    expect(evaluation.capabilities.RUNWAY).toMatchObject({ decision: "PASS", reasons: [] });
    expect(evaluation.capabilities.RUNWAY_CHANGE).toMatchObject({
      decision: "WAIT",
      reasons: expect.arrayContaining(["runway_change.independent_change_truth_unavailable"]),
    });
    expect(evaluation.capabilities.TRAJECTORY).toMatchObject({
      decision: "WAIT",
      reasons: expect.arrayContaining([
        "trajectory.state_capture_unavailable",
        "trajectory.independent_outcome_truth_unavailable",
      ]),
    });
  });

  it("waits rather than failing when evidence volume is insufficient", () => {
    const evidence = goodEvidence();
    evidence.ETA.observations = PREDICTIVE_READINESS_THRESHOLDS.ETA.minimumObservations - 1;
    evidence.ETA.scoreableObservations = 10;
    evidence.ETA.independentTruthFlights = 5;

    const result = evaluatePredictiveReadiness(evidence).capabilities.ETA;
    expect(result.decision).toBe("WAIT");
    expect(result.reasons).toContain("eta.insufficient_observations");
    expect(result.reasons).toContain("eta.insufficient_scoreable_observations");
    expect(result.reasons).toContain("eta.insufficient_independent_truth");
  });

  it("fails once sufficient evidence misses a quality threshold", () => {
    const evidence = goodEvidence();
    evidence.ETA.p90AbsoluteErrorSeconds = PREDICTIVE_READINESS_THRESHOLDS.ETA.maximumP90AbsoluteErrorSeconds + 1;
    evidence.RUNWAY.exactEndAccuracy = PREDICTIVE_READINESS_THRESHOLDS.RUNWAY.minimumExactEndAccuracy - 0.01;

    const evaluation = evaluatePredictiveReadiness(evidence);
    expect(evaluation.capabilities.ETA).toMatchObject({
      decision: "FAIL",
      reasons: expect.arrayContaining(["eta.p90_error_exceeds_threshold"]),
    });
    expect(evaluation.capabilities.RUNWAY).toMatchObject({
      decision: "FAIL",
      reasons: expect.arrayContaining(["runway.accuracy_below_threshold"]),
    });
  });

  it("treats lifecycle integrity conflicts as hard failures", () => {
    const evidence = goodEvidence();
    evidence.integrity.crossIcaoLifecycleConflicts = 1;

    const evaluation = evaluatePredictiveReadiness(evidence);
    expect(evaluation.capabilities.ETA.decision).toBe("FAIL");
    expect(evaluation.capabilities.RUNWAY.decision).toBe("FAIL");
    expect(evaluation.capabilities.ETA.reasons).toContain("integrity.cross_icao_lifecycle_conflict");
  });

  it("downgrades configured PUBLIC capabilities unless readiness is PASS", () => {
    const evaluation = evaluatePredictiveReadiness(goodEvidence());
    expect(enforcePredictiveReadiness({
      ETA: "PUBLIC",
      RUNWAY: "PUBLIC",
      RUNWAY_CHANGE: "PUBLIC",
      TRAJECTORY: "PUBLIC",
    }, evaluation)).toEqual({
      ETA: "PUBLIC",
      RUNWAY: "PUBLIC",
      RUNWAY_CHANGE: "SHADOW",
      TRAJECTORY: "SHADOW",
    });
  });
});
