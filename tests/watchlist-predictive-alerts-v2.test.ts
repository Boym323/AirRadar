import { describe, expect, it } from "vitest";
import { evaluateWatchlistPredictiveRule } from "@/lib/watchlist-predictive-alerts-v2";
import type { AlertRule } from "@/lib/server/alert-config";
import type { PublicEtaAdvisory } from "@/lib/predictive-intelligence/eta-advisory";
import type { PublicRunwayChangeAdvisory } from "@/lib/predictive-intelligence/runway-change-advisory";

const rule: AlertRule = {
  id: "ok-abc",
  name: "OK-ABC",
  enabled: true,
  type: "icaoHex",
  value: "ABC123",
  etaThresholdMinutes: 15,
  etaDestinationIcao: "LKTB",
  notifyRunwayChange: true,
};

function eta(horizonMinutes: number, estimatedArrivalAt = "2026-10-04T20:45:00.000Z"): PublicEtaAdvisory {
  return {
    kind: "ETA", state: "available", estimatedArrivalAt, evaluatedAt: "2026-10-04T20:30:00.000Z",
    ageSeconds: 5, horizonMinutes, confidence: "MEDIUM", uncertaintyMinutes: 4,
    uncertaintyBasis: "readiness_p90", modelVersion: "predictive-intelligence-v1", provenance: "predicted",
  };
}

function runwayChange(): PublicRunwayChangeAdvisory {
  return {
    kind: "RUNWAY_CHANGE", state: "available", changedFrom: "28", runway: "10",
    changedAt: "2026-10-04T20:31:00.000Z", evaluatedAt: "2026-10-04T20:31:05.000Z",
    ageSeconds: 5, changeAgeSeconds: 5, confidence: "HIGH",
    modelVersion: "predictive-intelligence-v1", provenance: "predicted",
  };
}

describe("Watchlist & Alerts V2 predictive rule evaluation", () => {
  it("creates an ETA candidate only inside the configured threshold", () => {
    expect(evaluateWatchlistPredictiveRule({
      rule, aircraftIcao: "ABC123", callsign: "TEST123", destinationIcao: "LKTB",
      etaAdvisory: eta(14), runwayChangeAdvisory: null,
    })).toMatchObject([{ kind: "ETA_THRESHOLD", metadata: { destinationIcao: "LKTB", thresholdMinutes: 15, horizonMinutes: 14 } }]);

    expect(evaluateWatchlistPredictiveRule({
      rule, aircraftIcao: "ABC123", callsign: "TEST123", destinationIcao: "LKTB",
      etaAdvisory: eta(16), runwayChangeAdvisory: null,
    })).toEqual([]);
  });

  it("requires the configured destination when one is set", () => {
    expect(evaluateWatchlistPredictiveRule({
      rule, aircraftIcao: "ABC123", callsign: "TEST123", destinationIcao: "LKPR",
      etaAdvisory: eta(10), runwayChangeAdvisory: null,
    })).toEqual([]);
  });

  it("uses a stable ETA event key across small ETA drift in the same arrival bucket", () => {
    const first = evaluateWatchlistPredictiveRule({
      rule, aircraftIcao: "ABC123", callsign: "TEST123", destinationIcao: "LKTB",
      etaAdvisory: eta(12, "2026-10-04T20:42:00.000Z"), runwayChangeAdvisory: null,
    })[0];
    const second = evaluateWatchlistPredictiveRule({
      rule, aircraftIcao: "ABC123", callsign: "TEST123", destinationIcao: "LKTB",
      etaAdvisory: eta(11, "2026-10-04T20:44:00.000Z"), runwayChangeAdvisory: null,
    })[0];
    expect(first?.eventKey).toBe(second?.eventKey);
  });

  it("creates a distinct runway-change candidate from a PUBLIC advisory", () => {
    const result = evaluateWatchlistPredictiveRule({
      rule, aircraftIcao: "ABC123", callsign: "TEST123", destinationIcao: "LKTB",
      etaAdvisory: null, runwayChangeAdvisory: runwayChange(),
    });
    expect(result).toMatchObject([{
      kind: "RUNWAY_CHANGE",
      metadata: { changedFrom: "28", runway: "10", destinationIcao: "LKTB", provenance: "predicted" },
    }]);
  });

  it("does not create runway-change alerts unless the rule opted in", () => {
    const result = evaluateWatchlistPredictiveRule({
      rule: { ...rule, notifyRunwayChange: false },
      aircraftIcao: "ABC123", callsign: "TEST123", destinationIcao: "LKTB",
      etaAdvisory: null, runwayChangeAdvisory: runwayChange(),
    });
    expect(result).toEqual([]);
  });
});
