import { describe, expect, it } from "vitest";
import {
  buildAdminRunwayAdvisoryPreview,
  buildPublicRunwayAdvisory,
  RUNWAY_ADVISORY_STALE_AFTER_MS,
  type PredictiveFlightState,
} from "@/lib/predictive-intelligence";
import type { PredictiveReadinessCapabilityResult } from "@/lib/predictive-intelligence/readiness";

const NOW = Date.parse("2026-10-04T10:00:00.000Z");

function prediction(overrides: Partial<PredictiveFlightState> = {}): PredictiveFlightState {
  return {
    modelVersion: "predictive-intelligence-v1",
    evaluatedAt: NOW - 8_000,
    eta: { estimatedArrivalAt: null, confidence: "UNKNOWN", evidence: [] },
    runway: {
      runway: "24",
      alternative: "06",
      confidence: "MEDIUM",
      changed: false,
      evidence: [],
    },
    trajectory: { state: "UNKNOWN", confidence: "UNKNOWN", evidence: [] },
    ...overrides,
  };
}

function readiness(
  decision: "PASS" | "WAIT" | "FAIL" = "PASS",
): PredictiveReadinessCapabilityResult<{
  observations: number;
  scoreableObservations: number;
  independentTruthFlights: number;
  exactEndAccuracy: number | null;
  coverage: number | null;
  captureStaleRate: number | null;
}> {
  return {
    capability: "RUNWAY",
    decision,
    reasons: decision === "PASS" ? [] : ["runway.insufficient_independent_truth"],
    evidence: {
      observations: 160,
      scoreableObservations: 120,
      independentTruthFlights: 85,
      exactEndAccuracy: 0.9,
      coverage: 0.72,
      captureStaleRate: 0.01,
    },
  };
}

const publicPolicy = { ETA: "SHADOW", RUNWAY: "PUBLIC", RUNWAY_CHANGE: "SHADOW", TRAJECTORY: "SHADOW" } as const;
const shadowPolicy = { ETA: "SHADOW", RUNWAY: "SHADOW", RUNWAY_CHANGE: "SHADOW", TRAJECTORY: "SHADOW" } as const;

describe("Predictive Runway Advisory V1", () => {
  it("publishes only a fresh runway with PUBLIC policy and PASS readiness", () => {
    expect(buildPublicRunwayAdvisory(prediction(), publicPolicy, readiness(), NOW)).toEqual({
      kind: "RUNWAY",
      state: "available",
      runway: "24",
      alternative: "06",
      evaluatedAt: "2026-10-04T09:59:52.000Z",
      ageSeconds: 8,
      confidence: "MEDIUM",
      modelVersion: "predictive-intelligence-v1",
      provenance: "predicted",
    });
  });

  it("does not publish runway while SHADOW or readiness is WAIT/FAIL", () => {
    expect(buildPublicRunwayAdvisory(prediction(), shadowPolicy, readiness(), NOW)).toBeNull();
    expect(buildPublicRunwayAdvisory(prediction(), publicPolicy, readiness("WAIT"), NOW)).toBeNull();
    expect(buildPublicRunwayAdvisory(prediction(), publicPolicy, readiness("FAIL"), NOW)).toBeNull();
  });

  it("does not publish unavailable, unknown-confidence or stale runway", () => {
    expect(buildPublicRunwayAdvisory(
      prediction({ runway: { runway: null, alternative: null, confidence: "MEDIUM", changed: false, evidence: [] } }),
      publicPolicy,
      readiness(),
      NOW,
    )).toBeNull();
    expect(buildPublicRunwayAdvisory(
      prediction({ runway: { runway: "24", alternative: "06", confidence: "UNKNOWN", changed: false, evidence: [] } }),
      publicPolicy,
      readiness(),
      NOW,
    )).toBeNull();
    expect(buildPublicRunwayAdvisory(
      prediction({ evaluatedAt: NOW - RUNWAY_ADVISORY_STALE_AFTER_MS - 1 }),
      publicPolicy,
      readiness(),
      NOW,
    )).toBeNull();
  });

  it("keeps SHADOW runway visible only as an admin preview", () => {
    expect(buildAdminRunwayAdvisoryPreview(prediction(), shadowPolicy, readiness("WAIT"), NOW)).toMatchObject({
      kind: "RUNWAY",
      mode: "SHADOW",
      readiness: "WAIT",
      publicEligible: false,
      state: "available",
      runway: "24",
      alternative: "06",
      confidence: "MEDIUM",
      exactEndAccuracy: 0.9,
      coverage: 0.72,
      provenance: "predicted",
    });
  });

  it("marks stale runway explicitly in admin preview", () => {
    expect(buildAdminRunwayAdvisoryPreview(
      prediction({ evaluatedAt: NOW - RUNWAY_ADVISORY_STALE_AFTER_MS - 1 }),
      shadowPolicy,
      readiness(),
      NOW,
    ).state).toBe("stale");
  });
});
