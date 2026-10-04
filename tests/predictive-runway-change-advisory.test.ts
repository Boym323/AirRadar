import { describe, expect, it } from "vitest";
import {
  buildAdminRunwayChangeAdvisoryPreview,
  buildPublicRunwayChangeAdvisory,
  RUNWAY_CHANGE_ADVISORY_EVENT_WINDOW_MS,
  RUNWAY_CHANGE_ADVISORY_STALE_AFTER_MS,
  type PredictiveFlightState,
} from "@/lib/predictive-intelligence";
import type {
  PredictiveReadinessCapabilityResult,
  RunwayChangeReadinessEvidence,
} from "@/lib/predictive-intelligence/readiness";

const NOW = Date.parse("2026-10-04T10:00:00.000Z");

function prediction(overrides: Partial<PredictiveFlightState> = {}): PredictiveFlightState {
  return {
    modelVersion: "predictive-intelligence-v1",
    evaluatedAt: NOW - 8_000,
    eta: { estimatedArrivalAt: null, confidence: "UNKNOWN", evidence: [] },
    runway: {
      runway: "24",
      alternative: "06",
      changedFrom: "06",
      changedAt: NOW - 45_000,
      confidence: "MEDIUM",
      changed: true,
      evidence: [],
    },
    trajectory: { state: "UNKNOWN", confidence: "UNKNOWN", evidence: [] },
    ...overrides,
  };
}

function readiness(
  decision: "PASS" | "WAIT" | "FAIL" = "PASS",
): PredictiveReadinessCapabilityResult<RunwayChangeReadinessEvidence> {
  return {
    capability: "RUNWAY_CHANGE",
    decision,
    reasons: decision === "PASS" ? [] : ["runway_change.independent_change_truth_unavailable"],
    evidence: {
      observations: 80,
      scoreableObservations: 45,
      independentTruthFlights: 35,
      outcomePrecision: 0.88,
      falsePositiveRate: 0.12,
      independentChangeTruthAvailable: true,
      captureStaleRate: 0.01,
    },
  };
}

const publicPolicy = { ETA: "SHADOW", RUNWAY: "SHADOW", RUNWAY_CHANGE: "PUBLIC", TRAJECTORY: "SHADOW" } as const;
const shadowPolicy = { ETA: "SHADOW", RUNWAY: "SHADOW", RUNWAY_CHANGE: "SHADOW", TRAJECTORY: "SHADOW" } as const;

describe("Predictive Runway Change Advisory V1", () => {
  it("publishes only a recent fresh change with PUBLIC policy and PASS readiness", () => {
    expect(buildPublicRunwayChangeAdvisory(prediction(), publicPolicy, readiness(), NOW)).toEqual({
      kind: "RUNWAY_CHANGE",
      state: "available",
      changedFrom: "06",
      runway: "24",
      changedAt: "2026-10-04T09:59:15.000Z",
      evaluatedAt: "2026-10-04T09:59:52.000Z",
      ageSeconds: 8,
      changeAgeSeconds: 45,
      confidence: "MEDIUM",
      modelVersion: "predictive-intelligence-v1",
      provenance: "predicted",
    });
  });

  it("suppresses SHADOW, WAIT and FAIL from public output", () => {
    expect(buildPublicRunwayChangeAdvisory(prediction(), shadowPolicy, readiness(), NOW)).toBeNull();
    expect(buildPublicRunwayChangeAdvisory(prediction(), publicPolicy, readiness("WAIT"), NOW)).toBeNull();
    expect(buildPublicRunwayChangeAdvisory(prediction(), publicPolicy, readiness("FAIL"), NOW)).toBeNull();
  });

  it("suppresses stale snapshots, expired changes and LOW/UNKNOWN confidence", () => {
    expect(buildPublicRunwayChangeAdvisory(
      prediction({ evaluatedAt: NOW - RUNWAY_CHANGE_ADVISORY_STALE_AFTER_MS - 1 }),
      publicPolicy,
      readiness(),
      NOW,
    )).toBeNull();
    expect(buildPublicRunwayChangeAdvisory(
      prediction({
        runway: {
          ...prediction().runway,
          changedAt: NOW - RUNWAY_CHANGE_ADVISORY_EVENT_WINDOW_MS - 1,
        },
      }),
      publicPolicy,
      readiness(),
      NOW,
    )).toBeNull();
    for (const confidence of ["LOW", "UNKNOWN"] as const) {
      expect(buildPublicRunwayChangeAdvisory(
        prediction({ runway: { ...prediction().runway, confidence } }),
        publicPolicy,
        readiness(),
        NOW,
      )).toBeNull();
    }
  });

  it("requires real change provenance rather than the alternative runway candidate", () => {
    expect(buildPublicRunwayChangeAdvisory(
      prediction({
        runway: {
          runway: "24",
          alternative: "06",
          changedFrom: null,
          changedAt: NOW - 45_000,
          confidence: "MEDIUM",
          changed: true,
          evidence: [],
        },
      }),
      publicPolicy,
      readiness(),
      NOW,
    )).toBeNull();
  });

  it("keeps WAIT/SHADOW evidence visible only in admin preview", () => {
    expect(buildAdminRunwayChangeAdvisoryPreview(
      prediction(),
      shadowPolicy,
      readiness("WAIT"),
      NOW,
    )).toMatchObject({
      kind: "RUNWAY_CHANGE",
      mode: "SHADOW",
      readiness: "WAIT",
      publicEligible: false,
      state: "available",
      changedFrom: "06",
      runway: "24",
      confidence: "MEDIUM",
      outcomePrecision: 0.88,
      falsePositiveRate: 0.12,
      independentChangeTruthAvailable: true,
      provenance: "predicted",
    });
  });

  it("marks an old event expired and rejects future change timestamps", () => {
    expect(buildAdminRunwayChangeAdvisoryPreview(
      prediction({
        runway: {
          ...prediction().runway,
          changedAt: NOW - RUNWAY_CHANGE_ADVISORY_EVENT_WINDOW_MS - 1,
        },
      }),
      shadowPolicy,
      readiness("WAIT"),
      NOW,
    ).state).toBe("expired");
    expect(buildAdminRunwayChangeAdvisoryPreview(
      prediction({
        runway: {
          ...prediction().runway,
          changedAt: NOW + 1,
        },
      }),
      shadowPolicy,
      readiness("WAIT"),
      NOW,
    ).state).toBe("unavailable");
  });
});
