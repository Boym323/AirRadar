import { describe, expect, it, vi } from "vitest";
import { AlertEngine } from "@/lib/server/alert-engine";
import type { AlertHistoryDetection, AlertHistoryEntry } from "@/lib/server/alert-history";
import type { Aircraft } from "@/lib/aircraft/types";
import type { PublicEtaAdvisory } from "@/lib/predictive-intelligence/eta-advisory";
import type { PublicRunwayChangeAdvisory } from "@/lib/predictive-intelligence/runway-change-advisory";

function aircraft(): Aircraft {
  return {
    icaoHex: "ABC123", callsign: "TEST123", registration: "OK-ABC", aircraftType: "A320", aircraftDescription: null,
    lat: 49.2, lon: 17.7, altitude: 9_000, baroAltitude: 9_000, geomAltitude: null, groundSpeed: 240, track: 260,
    verticalRate: -900, baroRate: -900, geomRate: null, squawk: null, category: null, emergency: null, rssi: null,
    messages: null, seenSeconds: 0, seenPosSeconds: 0, lastSeen: "2026-10-04T20:30:00.000Z", source: "ADS-B", sourceType: null,
    onGround: false, distanceKm: 42, bearing: 280, trail: [],
  };
}

function eta(): PublicEtaAdvisory {
  return {
    kind: "ETA", state: "available", estimatedArrivalAt: "2026-10-04T20:44:00.000Z", evaluatedAt: "2026-10-04T20:30:00.000Z",
    ageSeconds: 5, horizonMinutes: 14, confidence: "MEDIUM", uncertaintyMinutes: 4,
    uncertaintyBasis: "readiness_p90", modelVersion: "predictive-intelligence-v1", provenance: "predicted",
  };
}

function runwayChange(): PublicRunwayChangeAdvisory {
  return {
    kind: "RUNWAY_CHANGE", state: "available", changedFrom: "28", runway: "10",
    changedAt: "2026-10-04T20:30:00.000Z", evaluatedAt: "2026-10-04T20:30:05.000Z",
    ageSeconds: 5, changeAgeSeconds: 5, confidence: "HIGH",
    modelVersion: "predictive-intelligence-v1", provenance: "predicted",
  };
}

function historyRecorder() {
  const detected: AlertHistoryEntry[] = [];
  return {
    detected,
    recordDetected: vi.fn(async (event: AlertHistoryDetection) => {
      detected.push({
        id: event.id, detectedAt: event.detectedAt, type: event.type, reason: event.reason,
        aircraft: {
          icaoHex: event.aircraft.icaoHex, registration: event.aircraft.registration,
          callsign: event.aircraft.callsign, aircraftType: event.aircraft.aircraftType,
        },
        ruleIds: event.ruleIds ?? [], ruleNames: event.ruleNames ?? [], radiusKm: event.radiusKm ?? null,
        squawk: event.squawk ?? null, record: event.record ?? null, notificationStatus: "pending",
        notificationAttemptedAt: null, intelligence: event.intelligence ?? null, metadata: event.metadata,
      });
    }),
    recordNotification: vi.fn(async () => undefined),
  };
}

describe("Watchlist & Alerts V2 engine", () => {
  it("emits ETA and runway-change events for an opted-in matching rule", async () => {
    const history = historyRecorder();
    const engine = new AlertEngine({
      rules: [{
        id: "watch", enabled: true, type: "icaoHex", value: "ABC123",
        etaThresholdMinutes: 15, etaDestinationIcao: "LKTB", notifyRunwayChange: true,
      }],
      history,
      notifier: { name: "test", enabled: true, send: vi.fn(async () => undefined) },
    });
    const item = aircraft();
    engine.observePredictiveAdvisories(item, { destinationIcao: "LKTB", etaAdvisory: eta(), runwayChangeAdvisory: runwayChange() });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(history.detected.map((entry) => entry.type)).toEqual(["predictive_eta", "predictive_runway_change"]);
    expect(history.detected[0]?.metadata).toMatchObject({ destinationIcao: "LKTB", horizonMinutes: 14, provenance: "predicted" });
  });

  it("deduplicates the same predictive event across repeated evaluations", async () => {
    const history = historyRecorder();
    const engine = new AlertEngine({
      rules: [{
        id: "watch", enabled: true, type: "icaoHex", value: "ABC123",
        etaThresholdMinutes: 15, notifyRunwayChange: true,
      }],
      history,
      notifier: { name: "test", enabled: false, send: vi.fn(async () => undefined) },
    });
    const item = aircraft();
    const input = { destinationIcao: "LKTB", etaAdvisory: eta(), runwayChangeAdvisory: runwayChange() };
    engine.observePredictiveAdvisories(item, input);
    engine.observePredictiveAdvisories(item, input);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(history.detected.map((entry) => entry.type)).toEqual(["predictive_eta", "predictive_runway_change"]);
  });

  it("does not emit for a non-matching rule or destination", async () => {
    const history = historyRecorder();
    const engine = new AlertEngine({
      rules: [{
        id: "watch", enabled: true, type: "icaoHex", value: "DEF456",
        etaThresholdMinutes: 15, etaDestinationIcao: "LKPR", notifyRunwayChange: true,
      }],
      history,
      notifier: { name: "test", enabled: false, send: vi.fn(async () => undefined) },
    });
    engine.observePredictiveAdvisories(aircraft(), { destinationIcao: "LKTB", etaAdvisory: eta(), runwayChangeAdvisory: runwayChange() });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(history.detected).toEqual([]);
  });

  it("reports whether any predictive rule is active", () => {
    expect(new AlertEngine({ rules: [{ id: "plain", enabled: true, type: "icaoHex", value: "ABC123" }] }).hasPredictiveRules()).toBe(false);
    expect(new AlertEngine({ rules: [{ id: "eta", enabled: true, type: "icaoHex", value: "ABC123", etaThresholdMinutes: 10 }] }).hasPredictiveRules()).toBe(true);
  });
});
