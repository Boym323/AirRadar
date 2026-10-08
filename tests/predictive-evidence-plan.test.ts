import { describe, expect, it } from "vitest";
import { buildPredictiveEvidencePlan } from "@/lib/predictive-intelligence/evidence-plan";
import { buildPredictiveCaptureHealth } from "@/lib/predictive-intelligence/capture-health";
import { buildPredictiveGraduationCalibration } from "@/lib/predictive-intelligence/graduation-calibration";
import { evaluatePredictiveReadiness, type PredictiveReadinessEvidence } from "@/lib/predictive-intelligence/readiness";

function evidence(): PredictiveReadinessEvidence {
  return {
    ETA: { observations: 160, scoreableObservations: 140, independentTruthFlights: 80,
      medianAbsoluteErrorSeconds: 180, p90AbsoluteErrorSeconds: 420, p95AbsoluteErrorSeconds: 720, captureStaleRate: 0.01 },
    RUNWAY: { observations: 130, scoreableObservations: 70, independentTruthFlights: 45,
      exactEndAccuracy: 0.88, coverage: 0.54, captureStaleRate: 0.01 },
    RUNWAY_CHANGE: { observations: 40, scoreableObservations: 25, independentTruthFlights: 25,
      outcomePrecision: 0.9, falsePositiveRate: 0.1, independentChangeTruthAvailable: false, captureStaleRate: 0.01 },
    TRAJECTORY: { observations: 180, candidateObservations: 90, validatedCandidates: 60,
      precision: 0.45, stateCaptureAvailable: true, independentOutcomeTruthAvailable: true, captureStaleRate: 0.01 },
    integrity: { crossIcaoLifecycleConflicts: 0, crossFlightLifecycleConflicts: 0 },
  };
}

function plan(options: { sourceAvailable?: boolean; complete?: boolean; captureConfigured?: boolean; fresh?: boolean } = {}) {
  const e = evidence();
  const complete = options.complete ?? true;
  const readiness = evaluatePredictiveReadiness(e, { complete });
  const calibration = buildPredictiveGraduationCalibration(e, readiness, { complete });
  const now = new Date("2026-10-08T12:00:00.000Z");
  const captureHealth = buildPredictiveCaptureHealth(
    options.fresh === false ? [] : ["ETA", "RUNWAY", "RUNWAY_CHANGE", "TRAJECTORY"].map(capability => ({
      capability, createdAt: "2026-10-08T11:58:00.000Z",
    })), { now, sourceAvailable: options.sourceAvailable ?? true, complete, captureConfigured: options.captureConfigured ?? true },
  );
  return buildPredictiveEvidencePlan({
    sourceAvailable: options.sourceAvailable ?? true, complete, captureHealth,
    readiness: readiness.capabilities, calibration: calibration.capabilities,
  });
}

describe("Predictive Evidence Plan V1", () => {
  it("prioritizes independent truth and quality rather than publishing incomplete predictions", () => {
    const report = plan();
    expect(report.version).toBe("predictive-evidence-plan-v1");
    expect(report.capabilities.ETA).toMatchObject({ action: "MANUAL_REVIEW", decision: "PASS", operatorReviewSuggested: true });
    expect(report.capabilities.RUNWAY).toMatchObject({ action: "COLLECT_MORE_FLIGHTS", decision: "WAIT", operatorReviewSuggested: false });
    expect(report.capabilities.RUNWAY.largestEvidenceGap).toEqual({ key: "independentTruthFlights", missing: 5 });
    expect(report.capabilities.RUNWAY_CHANGE).toMatchObject({ action: "OBTAIN_INDEPENDENT_TRUTH", decision: "WAIT" });
    expect(report.capabilities.TRAJECTORY).toMatchObject({ action: "INVESTIGATE_QUALITY", decision: "FAIL" });
  });
  it("puts database, truncation, identity, disabled capture and quiet traffic before graduation", () => {
    expect(plan({ sourceAvailable: false }).capabilities.ETA.action).toBe("DATA_UNAVAILABLE");
    expect(plan({ complete: false }).capabilities.ETA.action).toBe("COLLECTION_TRUNCATED");
    expect(plan({ captureConfigured: false }).capabilities.ETA.action).toBe("CAPTURE_DISABLED");
    expect(plan({ fresh: false }).capabilities.ETA.action).toBe("CHECK_CAPTURE_ACTIVITY");
    expect(plan({ fresh: false }).capabilities.ETA.operatorReviewSuggested).toBe(false);
  });
  it("never mutates runtime policies or marks a feature PUBLIC", () => {
    const result = plan();
    expect(result.capabilities.ETA.operatorReviewSuggested).toBe(true);
    expect(result.capabilities.ETA).not.toHaveProperty("publicActive");
    expect(result.capabilities.ETA).not.toHaveProperty("effectivePolicy");
  });
});
