import { describe, expect, it } from "vitest";
import {
  buildAdminEtaAdvisoryPreview,
  buildPublicEtaAdvisory,
  ETA_ADVISORY_STALE_AFTER_MS,
  type PredictiveFlightState,
} from "@/lib/predictive-intelligence";
import type { PredictiveReadinessCapabilityResult } from "@/lib/predictive-intelligence/readiness";

const NOW = Date.parse("2026-10-04T10:00:00.000Z");

function prediction(overrides: Partial<PredictiveFlightState> = {}): PredictiveFlightState {
  return {
    modelVersion: "predictive-intelligence-v1",
    evaluatedAt: NOW - 8_000,
    eta: {
      estimatedArrivalAt: NOW + 28 * 60_000,
      confidence: "MEDIUM",
      evidence: [],
    },
    runway: { runway: null, alternative: null, confidence: "UNKNOWN", changed: false, evidence: [] },
    trajectory: { state: "UNKNOWN", confidence: "UNKNOWN", evidence: [] },
    ...overrides,
  };
}

function readiness(
  decision: "PASS" | "WAIT" | "FAIL" = "PASS",
  p90AbsoluteErrorSeconds: number | null = 240,
): PredictiveReadinessCapabilityResult<{
  observations: number;
  scoreableObservations: number;
  independentTruthFlights: number;
  medianAbsoluteErrorSeconds: number | null;
  p90AbsoluteErrorSeconds: number | null;
  p95AbsoluteErrorSeconds: number | null;
  captureStaleRate: number | null;
}> {
  return {
    capability: "ETA",
    decision,
    reasons: decision === "PASS" ? [] : ["eta.insufficient_independent_truth"],
    evidence: {
      observations: 200,
      scoreableObservations: 180,
      independentTruthFlights: 90,
      medianAbsoluteErrorSeconds: 120,
      p90AbsoluteErrorSeconds,
      p95AbsoluteErrorSeconds: 360,
      captureStaleRate: 0,
    },
  };
}

const publicPolicy = { ETA: "PUBLIC", RUNWAY: "SHADOW", RUNWAY_CHANGE: "SHADOW", TRAJECTORY: "SHADOW" } as const;
const shadowPolicy = { ETA: "SHADOW", RUNWAY: "SHADOW", RUNWAY_CHANGE: "SHADOW", TRAJECTORY: "SHADOW" } as const;

describe("Predictive ETA Advisory V1", () => {
  it("publishes only fresh ETA with PUBLIC policy, PASS readiness and calibrated p90 uncertainty", () => {
    expect(buildPublicEtaAdvisory(prediction(), publicPolicy, readiness(), NOW)).toEqual({
      kind: "ETA",
      state: "available",
      estimatedArrivalAt: "2026-10-04T10:28:00.000Z",
      evaluatedAt: "2026-10-04T09:59:52.000Z",
      ageSeconds: 8,
      horizonMinutes: 28,
      confidence: "MEDIUM",
      uncertaintyMinutes: 4,
      uncertaintyBasis: "readiness_p90",
      modelVersion: "predictive-intelligence-v1",
      provenance: "predicted",
    });
  });

  it("does not publish ETA while SHADOW or while readiness is WAIT/FAIL", () => {
    expect(buildPublicEtaAdvisory(prediction(), shadowPolicy, readiness(), NOW)).toBeNull();
    expect(buildPublicEtaAdvisory(prediction(), publicPolicy, readiness("WAIT"), NOW)).toBeNull();
    expect(buildPublicEtaAdvisory(prediction(), publicPolicy, readiness("FAIL"), NOW)).toBeNull();
  });

  it("does not publish uncalibrated, stale, expired or unknown-confidence ETA", () => {
    expect(buildPublicEtaAdvisory(prediction(), publicPolicy, readiness("PASS", null), NOW)).toBeNull();
    expect(buildPublicEtaAdvisory(prediction({ evaluatedAt: NOW - ETA_ADVISORY_STALE_AFTER_MS - 1 }), publicPolicy, readiness(), NOW)).toBeNull();
    expect(buildPublicEtaAdvisory(prediction({ eta: { estimatedArrivalAt: NOW - 1, confidence: "HIGH", evidence: [] } }), publicPolicy, readiness(), NOW)).toBeNull();
    expect(buildPublicEtaAdvisory(prediction({ eta: { estimatedArrivalAt: NOW + 60_000, confidence: "UNKNOWN", evidence: [] } }), publicPolicy, readiness(), NOW)).toBeNull();
  });

  it("keeps SHADOW visible as an admin preview with readiness and state metadata", () => {
    expect(buildAdminEtaAdvisoryPreview(prediction(), shadowPolicy, readiness("WAIT", null), NOW)).toMatchObject({
      kind: "ETA",
      mode: "SHADOW",
      readiness: "WAIT",
      publicEligible: false,
      state: "available",
      confidence: "MEDIUM",
      uncertaintyMinutes: null,
      uncertaintyBasis: "not_calibrated",
      provenance: "predicted",
    });
  });

  it("marks stale and expired states explicitly in admin preview", () => {
    expect(buildAdminEtaAdvisoryPreview(
      prediction({ evaluatedAt: NOW - ETA_ADVISORY_STALE_AFTER_MS - 1 }),
      shadowPolicy,
      readiness(),
      NOW,
    ).state).toBe("stale");

    expect(buildAdminEtaAdvisoryPreview(
      prediction({ eta: { estimatedArrivalAt: NOW - 1, confidence: "HIGH", evidence: [] } }),
      shadowPolicy,
      readiness(),
      NOW,
    ).state).toBe("expired");
  });
});
