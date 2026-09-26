import { describe, expect, it } from "vitest";
import type { FlightIntelligenceReplayReport } from "@/lib/intelligence/replay";
import { summarizeFlightIntelligenceReplay } from "@/lib/intelligence/replay-metrics";

function report(overrides: Partial<FlightIntelligenceReplayReport> = {}): FlightIntelligenceReplayReport {
  return {
    flightId: 1,
    icaoHex: "ABC123",
    positions: 10,
    inputQuality: { level: "partial", missingSignals: [], comparableEventTypes: ["HOLDING"] },
    replayedEvents: [{
      id: "1", eventKey: "1", lifecycleKey: "1", type: "HOLDING", phase: "CRUISE",
      icaoHex: "ABC123", flightId: 1, callsign: "TST1", registration: null,
      occurredAt: "2026-09-17T12:00:00.000Z", detectedAt: "2026-09-17T12:00:00.000Z",
      latitude: 50, longitude: 14, altitude: 10000, confidence: 0.9, confidenceLevel: "HIGH",
      airportIcao: null, runway: null, runwayContext: null, sectorId: null, evidence: [],
    }],
    persistedComparableEvents: [{ type: "HOLDING", occurredAt: "2026-09-17T12:00:30.000Z" }],
    unsupportedPersistedEvents: [],
    matches: [{ type: "HOLDING", replayedAt: "2026-09-17T12:00:00.000Z", persistedAt: "2026-09-17T12:00:30.000Z", deltaMs: 30_000 }],
    falsePositives: [],
    falseNegatives: [],
    metrics: { truePositives: 1, falsePositives: 0, falseNegatives: 0, precision: 1, recall: 1 },
    ...overrides,
  };
}

describe("flight intelligence replay quality metrics", () => {
  it("aggregates precision, recall, confidence, and event timing", () => {
    const summary = summarizeFlightIntelligenceReplay([
      report(),
      report({
        flightId: 2,
        metrics: { truePositives: 0, falsePositives: 1, falseNegatives: 1, precision: 0, recall: 0 },
        matches: [],
        falsePositives: [{ type: "HOLDING", occurredAt: "2026-09-17T13:00:00.000Z" }],
        falseNegatives: [{ type: "HOLDING", occurredAt: "2026-09-17T13:00:30.000Z" }],
      }),
    ]);
    expect(summary).toMatchObject({
      flights: 2,
      positions: 20,
      metrics: { truePositives: 1, falsePositives: 1, falseNegatives: 1, precision: 0.5, recall: 0.5 },
    });
    expect(summary.byEventType).toContainEqual(expect.objectContaining({
      type: "HOLDING",
      truePositives: 1,
      falsePositives: 1,
      falseNegatives: 1,
      precision: 0.5,
      recall: 0.5,
      timing: expect.objectContaining({ samples: 1, p50AbsoluteDeltaMs: 30_000, p95AbsoluteDeltaMs: 30_000 }),
      replayedConfidence: expect.objectContaining({ samples: 2, high: 2 }),
    }));
  });

  it("tracks truncated historical inputs separately", () => {
    const summary = summarizeFlightIntelligenceReplay([
      report({ inputQuality: { level: "partial", missingSignals: ["HistoryFlightDetail.positionsTruncated"], comparableEventTypes: ["HOLDING"] } }),
    ]);
    expect(summary.truncatedFlights).toBe(1);
  });
});
