import { describe, expect, it } from "vitest";
import { buildAirportArrivalSequence } from "@/lib/airport-intelligence/arrival-sequence-v7";
import type { AirportCorrelatedTrafficSnapshot } from "@/lib/airport-intelligence/v3";
import type { PredictiveOperationsResponse } from "@/lib/predictive-intelligence/operations-center";

function observation(
  hex: string,
  distanceKm: number,
  stage: "INBOUND" | "APPROACH" | "FINAL" | "HOLDING",
  routeRelation: "CONFIRMED" | "UNKNOWN" | "CONFLICT" = "CONFIRMED",
): AirportCorrelatedTrafficSnapshot["inbound"][number] {
  return {
    aircraft: {
      icaoHex: hex, callsign: hex, registration: null, aircraftType: null, aircraftDescription: null,
      lat: 49, lon: 17, altitude: 5000, baroAltitude: 5000, geomAltitude: null, groundSpeed: 200, track: 270,
      verticalRate: -500, baroRate: -500, geomRate: null, squawk: null, category: null, emergency: null, rssi: null,
      messages: null, seenSeconds: 0, seenPosSeconds: 0, lastSeen: "2026-10-04T20:00:00.000Z", source: "ADS-B",
      sourceType: null, onGround: false, distanceKm, bearing: 90, trail: [],
    },
    distanceKm, bearingToAirport: 270, classification: "approaching",
    movement: null, movementAgeSeconds: null,
    journey: { stage, routeRelation, origin: "LKPR", destination: routeRelation === "CONFLICT" ? "LOWW" : "LKTB" },
  };
}

function traffic(): AirportCorrelatedTrafficSnapshot {
  return {
    inbound: [
      observation("AAA111", 18, "APPROACH"),
      observation("BBB222", 8, "FINAL"),
      observation("CCC333", 25, "HOLDING"),
      observation("DDD444", 12, "APPROACH", "CONFLICT"),
    ],
    outbound: [],
  };
}

function predictive(): PredictiveOperationsResponse {
  return {
    generatedAt: "2026-10-04T20:00:00.000Z",
    items: [
      {
        icaoHex: "AAA111", label: "AAA111", callsign: "AAA111", registration: null, destination: "LKTB",
        etaAdvisory: { kind: "ETA", state: "available", estimatedArrivalAt: "2026-10-04T20:08:00.000Z", evaluatedAt: "2026-10-04T20:00:00.000Z", ageSeconds: 3, horizonMinutes: 8, confidence: "MEDIUM", uncertaintyMinutes: 3, uncertaintyBasis: "readiness_p90", modelVersion: "predictive-intelligence-v1", provenance: "predicted" },
        runwayAdvisory: { kind: "RUNWAY", state: "available", runway: "28", alternative: null, evaluatedAt: "2026-10-04T20:00:00.000Z", ageSeconds: 3, confidence: "HIGH", modelVersion: "predictive-intelligence-v1", provenance: "predicted" },
        runwayChangeAdvisory: null, trajectoryAdvisory: null,
      },
      {
        icaoHex: "BBB222", label: "BBB222", callsign: "BBB222", registration: null, destination: "LKTB",
        etaAdvisory: { kind: "ETA", state: "available", estimatedArrivalAt: "2026-10-04T20:04:00.000Z", evaluatedAt: "2026-10-04T20:00:00.000Z", ageSeconds: 3, horizonMinutes: 4, confidence: "HIGH", uncertaintyMinutes: 2, uncertaintyBasis: "readiness_p90", modelVersion: "predictive-intelligence-v1", provenance: "predicted" },
        runwayAdvisory: { kind: "RUNWAY", state: "available", runway: "28", alternative: null, evaluatedAt: "2026-10-04T20:00:00.000Z", ageSeconds: 3, confidence: "HIGH", modelVersion: "predictive-intelligence-v1", provenance: "predicted" },
        runwayChangeAdvisory: null, trajectoryAdvisory: null,
      },
      {
        icaoHex: "CCC333", label: "CCC333", callsign: "CCC333", registration: null, destination: "LKPR",
        etaAdvisory: null, runwayAdvisory: null, runwayChangeAdvisory: null, trajectoryAdvisory: null,
      },
    ],
  };
}

describe("Airport Live Board V7 arrival sequence", () => {
  it("orders PUBLIC ETA arrivals first and excludes route conflicts", () => {
    const result = buildAirportArrivalSequence(traffic(), predictive(), "LKTB");
    expect(result.version).toBe("airport-live-board-v7");
    expect(result.items.map((item) => item.icaoHex)).toEqual(["BBB222", "AAA111", "CCC333"]);
    expect(result.items[0]).toMatchObject({ position: 1, etaHorizonMinutes: 4, runway: "28", orderBasis: "ETA" });
    expect(result.items[2]).toMatchObject({ etaAt: null, runway: null, orderBasis: "DISTANCE" });
  });

  it("computes median public ETA spacing and predicted runway stability", () => {
    const result = buildAirportArrivalSequence(traffic(), predictive(), "LKTB");
    expect(result.medianSpacingMinutes).toBe(4);
    expect(result.publicPredictionCount).toBe(2);
    expect(result.predictionCoverage).toBeCloseTo(2 / 3);
    expect(result.predictedRunway).toEqual({ designator: "28", consistency: "STABLE", share: 1, samples: 2 });
  });

  it("falls back deterministically to journey stage and distance without predictions", () => {
    const result = buildAirportArrivalSequence(traffic(), null, "LKTB");
    expect(result.items.map((item) => item.icaoHex)).toEqual(["BBB222", "AAA111", "CCC333"]);
    expect(result.medianSpacingMinutes).toBeNull();
    expect(result.items.every((item) => item.orderBasis === "DISTANCE")).toBe(true);
    expect(result.predictedRunway.consistency).toBe("UNKNOWN");
  });

  it("requires either a confirmed route or a PUBLIC prediction matching the airport", () => {
    const unknown = {
      inbound: [
        observation("UNK111", 10, "INBOUND", "UNKNOWN"),
        observation("AAA111", 20, "INBOUND", "UNKNOWN"),
      ],
      outbound: [],
    };
    const result = buildAirportArrivalSequence({ airportIcao: "LKTB", traffic: unknown, predictive: predictive() });
    expect(result.items.map((item) => item.icaoHex)).toEqual(["AAA111"]);
  });

  it("caps the arrival sequence to six aircraft", () => {
    const inbound = Array.from({ length: 8 }, (_, index) =>
      observation(`ABC00${index}`, 8 + index, "INBOUND"));
    const result = buildAirportArrivalSequence({
      airportIcao: "LKTB",
      traffic: { inbound, outbound: [] },
      predictive: null,
    });
    expect(result.items).toHaveLength(6);
  });
});
