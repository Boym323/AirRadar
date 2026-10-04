import { describe, expect, it } from "vitest";
import {
  buildPredictiveGraduationCalibration,
  PREDICTIVE_GRADUATION_CALIBRATION_VERSION,
} from "@/lib/predictive-intelligence/graduation-calibration";
import {
  evaluatePredictiveReadiness,
  PREDICTIVE_READINESS_THRESHOLDS,
  type PredictiveReadinessEvidence,
} from "@/lib/predictive-intelligence/readiness";

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
      independentChangeTruthAvailable: true,
      captureStaleRate: 0.01,
    },
    TRAJECTORY: {
      observations: 180,
      candidateObservations: 80,
      validatedCandidates: 60,
      precision: 0.9,
      stateCaptureAvailable: true,
      independentOutcomeTruthAvailable: true,
      captureStaleRate: 0.01,
    },
    integrity: {
      crossIcaoLifecycleConflicts: 0,
      crossFlightLifecycleConflicts: 0,
    },
  };
}

describe("Predictive Graduation Calibration V1", () => {
  it("marks PASS capabilities ready for manual PUBLIC review without auto-promotion", () => {
    const evidence = goodEvidence();
    const evaluation = evaluatePredictiveReadiness(evidence);
    const calibration = buildPredictiveGraduationCalibration(evidence, evaluation, { complete: true });

    expect(calibration.version).toBe(PREDICTIVE_GRADUATION_CALIBRATION_VERSION);
    expect(calibration.thresholdVersion).toBe("predictive-readiness-v1");
    expect(calibration.capabilities.ETA).toMatchObject({
      decision: "PASS",
      phase: "READY",
      manualReviewEligible: true,
      qualityEvaluated: true,
      evidenceDeficits: [],
      readinessReasons: [],
    });
    expect(calibration.capabilities.TRAJECTORY.manualReviewEligible).toBe(true);
  });

  it("reports exact sample deficits while evidence is still collecting", () => {
    const evidence = goodEvidence();
    evidence.ETA.observations = 73;
    evidence.ETA.scoreableObservations = 41;
    evidence.ETA.independentTruthFlights = 12;

    const evaluation = evaluatePredictiveReadiness(evidence);
    const result = buildPredictiveGraduationCalibration(evidence, evaluation, { complete: true }).capabilities.ETA;

    expect(result).toMatchObject({
      decision: "WAIT",
      phase: "COLLECTING",
      manualReviewEligible: false,
      qualityEvaluated: false,
    });
    expect(result.evidenceDeficits).toEqual([
      { key: "observations", current: 73, target: 100, missing: 27, unit: "COUNT" },
      { key: "scoreableObservations", current: 41, target: 100, missing: 59, unit: "COUNT" },
      { key: "independentTruthFlights", current: 12, target: 50, missing: 38, unit: "COUNT" },
    ]);
  });

  it("separates truth and instrumentation blockers from ordinary collection deficits", () => {
    const evidence = goodEvidence();
    evidence.RUNWAY_CHANGE.independentChangeTruthAvailable = false;
    evidence.TRAJECTORY.independentOutcomeTruthAvailable = false;

    const evaluation = evaluatePredictiveReadiness(evidence);
    const calibration = buildPredictiveGraduationCalibration(evidence, evaluation, { complete: true });

    expect(calibration.capabilities.RUNWAY_CHANGE).toMatchObject({
      phase: "TRUTH_BLOCKED",
      truthRequirements: [{ key: "independentChangeTruthAvailable", available: false }],
    });
    expect(calibration.capabilities.TRAJECTORY.phase).toBe("TRUTH_BLOCKED");
    expect(calibration.capabilities.TRAJECTORY.truthRequirements).toEqual([
      { key: "stateCaptureAvailable", available: true },
      { key: "independentOutcomeTruthAvailable", available: false },
    ]);
  });

  it("reports negative quality margin when sufficient evidence fails a threshold", () => {
    const evidence = goodEvidence();
    evidence.RUNWAY.exactEndAccuracy = PREDICTIVE_READINESS_THRESHOLDS.RUNWAY.minimumExactEndAccuracy - 0.03;

    const evaluation = evaluatePredictiveReadiness(evidence);
    const result = buildPredictiveGraduationCalibration(evidence, evaluation, { complete: true }).capabilities.RUNWAY;
    const accuracy = result.qualityMargins.find((metric) => metric.key === "exactEndAccuracy");

    expect(result).toMatchObject({
      decision: "FAIL",
      phase: "QUALITY_BLOCKED",
      manualReviewEligible: false,
      qualityEvaluated: true,
    });
    expect(accuracy).toMatchObject({
      direction: "AT_LEAST",
      satisfied: false,
      margin: expect.closeTo(-0.03, 8),
    });
  });

  it("treats incomplete bounded collection as a distinct fail-closed phase", () => {
    const evidence = goodEvidence();
    const evaluation = evaluatePredictiveReadiness(evidence, { complete: false });
    const calibration = buildPredictiveGraduationCalibration(evidence, evaluation, { complete: false });

    expect(calibration.capabilities.ETA).toMatchObject({
      decision: "WAIT",
      phase: "COLLECTION_BLOCKED",
      manualReviewEligible: false,
      collectionBlockers: ["collection.bounded_result_incomplete"],
    });
  });

  it("classifies lifecycle integrity conflicts as hard blockers", () => {
    const evidence = goodEvidence();
    evidence.integrity.crossIcaoLifecycleConflicts = 1;

    const evaluation = evaluatePredictiveReadiness(evidence);
    const result = buildPredictiveGraduationCalibration(evidence, evaluation, { complete: true }).capabilities.ETA;

    expect(result).toMatchObject({
      decision: "FAIL",
      phase: "HARD_BLOCKED",
      manualReviewEligible: false,
      integrityBlockers: ["integrity.cross_icao_lifecycle_conflict"],
    });
  });

  it("shows quality headroom without turning WAIT evidence into a quality decision", () => {
    const evidence = goodEvidence();
    evidence.ETA.observations = 10;

    const evaluation = evaluatePredictiveReadiness(evidence);
    const result = buildPredictiveGraduationCalibration(evidence, evaluation, { complete: true }).capabilities.ETA;
    const p90 = result.qualityMargins.find((metric) => metric.key === "p90AbsoluteErrorSeconds");

    expect(result.qualityEvaluated).toBe(false);
    expect(p90).toMatchObject({
      satisfied: true,
      margin: 180,
    });
  });
});
