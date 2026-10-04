import { describe, expect, it } from "vitest";
import {
  buildAirportApproachQueueIntelligence,
  type AirportApproachQueueState,
} from "@/lib/airport-intelligence/approach-queue-v8";
import type {
  AirportArrivalSequenceItem,
  AirportArrivalSequenceSummary,
} from "@/lib/airport-intelligence/arrival-sequence-v7";

function item(
  position: number,
  stage: AirportArrivalSequenceItem["stage"],
  etaMinute: number | null,
): AirportArrivalSequenceItem {
  return {
    position,
    icaoHex: `ABC${position.toString().padStart(3, "0")}`,
    label: `TEST${position}`,
    stage,
    distanceKm: 5 + position * 4,
    orderBasis: etaMinute === null ? "DISTANCE" : "ETA",
    etaAt: etaMinute === null ? null : `2026-10-04T20:${String(etaMinute).padStart(2, "0")}:00.000Z`,
    etaHorizonMinutes: etaMinute,
    etaUncertaintyMinutes: etaMinute === null ? null : 3,
    etaConfidence: etaMinute === null ? null : "MEDIUM",
    runway: "29",
    runwayConfidence: "MEDIUM",
  };
}

function sequence(items: AirportArrivalSequenceItem[]): AirportArrivalSequenceSummary {
  const etaPredicted = items.filter((entry) => entry.etaAt !== null).length;
  return {
    version: "airport-live-board-v7",
    generatedAt: "2026-10-04T20:00:00.000Z",
    totalCandidates: items.length,
    etaPredicted,
    runwayPredicted: items.length,
    predictionCoverage: items.length ? etaPredicted / items.length : null,
    medianSpacingMinutes: null,
    runway: { designator: "29", consistency: items.length >= 2 ? "STABLE" : "UNKNOWN", share: items.length ? 1 : null, samples: items.length },
    items,
  };
}

function state(items: AirportArrivalSequenceItem[]): AirportApproachQueueState {
  return buildAirportApproachQueueIntelligence(sequence(items)).state;
}

describe("Airport Live Board V8 approach queue intelligence", () => {
  it("keeps empty and sparse traffic explicit", () => {
    expect(state([])).toBe("EMPTY");
    expect(state([item(1, "FINAL", 4), item(2, "APPROACH", 12)])).toBe("LOW_DENSITY");
  });

  it("reports active traffic without inventing queue pressure", () => {
    const result = buildAirportApproachQueueIntelligence(sequence([
      item(1, "FINAL", 4),
      item(2, "INBOUND", 13),
      item(3, "INBOUND", 23),
    ]));
    expect(result.state).toBe("ACTIVE");
    expect(result.activeArrivals).toBe(3);
    expect(result.compressedPairs).toBe(0);
    expect(result.minimumSpacingMinutes).toBe(9);
  });

  it("marks a dense approach bank as building", () => {
    const result = buildAirportApproachQueueIntelligence(sequence([
      item(1, "FINAL", 4),
      item(2, "APPROACH", 10),
      item(3, "APPROACH", 16),
      item(4, "INBOUND", 22),
    ]));
    expect(result.state).toBe("BUILDING");
    expect(result.approachOrFinal).toBe(3);
    expect(result.medianSpacingMinutes).toBe(6);
    expect(result.reasons).toContain("arrival_density");
  });

  it("requires two adjacent ETA gaps of four minutes or less before calling the sequence compressed", () => {
    const result = buildAirportApproachQueueIntelligence(sequence([
      item(1, "FINAL", 4),
      item(2, "APPROACH", 7),
      item(3, "APPROACH", 10),
      item(4, "INBOUND", 20),
    ]));
    expect(result.state).toBe("COMPRESSED");
    expect(result.compressedPairs).toBe(2);
    expect(result.minimumSpacingMinutes).toBe(3);
    expect(result.reasons).toContain("eta_compression");
  });

  it("surfaces multiple holding aircraft before ETA compression", () => {
    const result = buildAirportApproachQueueIntelligence(sequence([
      item(1, "HOLDING", null),
      item(2, "HOLDING", null),
      item(3, "APPROACH", 8),
      item(4, "INBOUND", 18),
    ]));
    expect(result.state).toBe("HOLDING_PRESENT");
    expect(result.holding).toBe(2);
    expect(result.reasons).toContain("multiple_holding");
  });

  it("reports bounded PUBLIC ETA coverage and spacing metrics", () => {
    const result = buildAirportApproachQueueIntelligence(sequence([
      item(1, "FINAL", 4),
      item(2, "APPROACH", 9),
      item(3, "INBOUND", null),
      item(4, "INBOUND", 17),
    ]));
    expect(result.etaSamples).toBe(3);
    expect(result.etaCoverage).toBeCloseTo(0.75);
    expect(result.minimumSpacingMinutes).toBe(5);
    expect(result.medianSpacingMinutes).toBe(6.5);
  });
});
