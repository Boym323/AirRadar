import { describe, expect, it } from "vitest";
import {
  buildAdminTrajectoryAdvisoryPreview,
  buildPublicTrajectoryAdvisory,
  TRAJECTORY_ADVISORY_STALE_AFTER_MS,
  type PredictiveFlightState,
} from "@/lib/predictive-intelligence";
import type {
  PredictiveReadinessCapabilityResult,
  TrajectoryReadinessEvidence,
} from "@/lib/predictive-intelligence/readiness";

const NOW = Date.parse("2026-10-04T10:00:00.000Z");

function prediction(overrides: Partial<PredictiveFlightState> = {}): PredictiveFlightState {
  return {
    modelVersion: "predictive-intelligence-v1",
    evaluatedAt: NOW - 8_000,
    eta: { estimatedArrivalAt: null, confidence: "UNKNOWN", evidence: [] },
    runway: { runway: null, alternative: null, confidence: "UNKNOWN", changed: false, evidence: [] },
    trajectory: {
      state: "DEVIATING",
      confidence: "MEDIUM",
      evidence: [
        { key: "crossTrackKm", value: 18.4 },
        { key: "distanceChangeKm", value: 7.2 },
      ],
    },
    ...overrides,
  };
}

function readiness(
  decision: "PASS" | "WAIT" | "FAIL" = "PASS",
): PredictiveReadinessCapabilityResult<TrajectoryReadinessEvidence> {
  return {
    capability: "TRAJECTORY",
    decision,
    reasons: decision === "PASS" ? [] : ["trajectory.independent_outcome_truth_unavailable"],
    evidence: {
      observations: 160,
      candidateObservations: 48,
      validatedCandidates: 52,
      precision: 0.87,
      stateCaptureAvailable: true,
      independentOutcomeTruthAvailable: true,
      captureStaleRate: 0.01,
    },
  };
}

const publicPolicy = { ETA: "SHADOW", RUNWAY: "SHADOW", RUNWAY_CHANGE: "SHADOW", TRAJECTORY: "PUBLIC" } as const;
const shadowPolicy = { ETA: "SHADOW", RUNWAY: "SHADOW", RUNWAY_CHANGE: "SHADOW", TRAJECTORY: "SHADOW" } as const;

describe("Predictive Trajectory Advisory V1", () => {
  it("publishes only a fresh known MEDIUM/HIGH trajectory with PUBLIC policy and PASS readiness", () => {
    expect(buildPublicTrajectoryAdvisory(prediction(), publicPolicy, readiness(), NOW)).toEqual({
      kind: "TRAJECTORY",
      state: "available",
      trajectoryState: "DEVIATING",
      evaluatedAt: "2026-10-04T09:59:52.000Z",
      ageSeconds: 8,
      confidence: "MEDIUM",
      modelVersion: "predictive-intelligence-v1",
      provenance: "predicted",
      evidence: [
        { key: "crossTrackKm", value: 18.4 },
        { key: "distanceChangeKm", value: 7.2 },
      ],
    });
  });

  it("suppresses SHADOW, WAIT and FAIL from public output", () => {
    expect(buildPublicTrajectoryAdvisory(prediction(), shadowPolicy, readiness(), NOW)).toBeNull();
    expect(buildPublicTrajectoryAdvisory(prediction(), publicPolicy, readiness("WAIT"), NOW)).toBeNull();
    expect(buildPublicTrajectoryAdvisory(prediction(), publicPolicy, readiness("FAIL"), NOW)).toBeNull();
  });

  it("suppresses UNKNOWN, LOW confidence and stale trajectory states", () => {
    expect(buildPublicTrajectoryAdvisory(
      prediction({ trajectory: { state: "UNKNOWN", confidence: "UNKNOWN", evidence: [] } }),
      publicPolicy,
      readiness(),
      NOW,
    )).toBeNull();
    expect(buildPublicTrajectoryAdvisory(
      prediction({ trajectory: { state: "POSSIBLE_DEVIATION", confidence: "LOW", evidence: [] } }),
      publicPolicy,
      readiness(),
      NOW,
    )).toBeNull();
    expect(buildPublicTrajectoryAdvisory(
      prediction({ evaluatedAt: NOW - TRAJECTORY_ADVISORY_STALE_AFTER_MS - 1 }),
      publicPolicy,
      readiness(),
      NOW,
    )).toBeNull();
  });

  it("allows a confident NORMAL state after graduation", () => {
    expect(buildPublicTrajectoryAdvisory(
      prediction({ trajectory: { state: "NORMAL", confidence: "MEDIUM", evidence: [] } }),
      publicPolicy,
      readiness(),
      NOW,
    )).toMatchObject({
      trajectoryState: "NORMAL",
      confidence: "MEDIUM",
    });
  });

  it("keeps LOW-confidence candidates visible only in admin preview", () => {
    expect(buildAdminTrajectoryAdvisoryPreview(
      prediction({ trajectory: { state: "POSSIBLE_DEVIATION", confidence: "LOW", evidence: [] } }),
      shadowPolicy,
      readiness("WAIT"),
      NOW,
    )).toMatchObject({
      kind: "TRAJECTORY",
      mode: "SHADOW",
      readiness: "WAIT",
      publicEligible: false,
      state: "available",
      trajectoryState: "POSSIBLE_DEVIATION",
      confidence: "LOW",
      candidateObservations: 48,
      validatedCandidates: 52,
      precision: 0.87,
      stateCaptureAvailable: true,
      independentOutcomeTruthAvailable: true,
      provenance: "predicted",
    });
  });

  it("marks stale trajectory explicitly in admin preview", () => {
    expect(buildAdminTrajectoryAdvisoryPreview(
      prediction({ evaluatedAt: NOW - TRAJECTORY_ADVISORY_STALE_AFTER_MS - 1 }),
      shadowPolicy,
      readiness("WAIT"),
      NOW,
    ).state).toBe("stale");
  });
});
