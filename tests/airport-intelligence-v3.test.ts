import { describe, expect, it } from "vitest";
import type { AirportRunway } from "@/lib/airports/infrastructure";
import {
  buildAirportActiveTrafficSnapshot,
  buildAirportCorrelatedTrafficSnapshot,
  buildAirportLiveBoardSnapshot,
  buildAirportOperationsTimeline,
  buildAirportRunwayIntelligence,
} from "@/lib/airport-intelligence/v3";
import type { AirportMovement } from "@/lib/server/airport-movements";
import type { AirportOperationsResponse } from "@/lib/server/airport-operations";
import type { MetarObservation } from "@/lib/weather/types";

const runways: AirportRunway[] = [{
  id: 1,
  airportId: 1,
  sourceAirportIdent: "LOWW",
  lengthFt: 11_500,
  widthFt: 150,
  surface: "ASP",
  lighted: true,
  closed: false,
  leIdent: "11",
  leLatitude: 48.1,
  leLongitude: 16.5,
  leElevationFt: 600,
  leHeadingDegT: 110,
  leDisplacedThresholdFt: null,
  heIdent: "29",
  heLatitude: 48.1,
  heLongitude: 16.4,
  heElevationFt: 600,
  heHeadingDegT: 290,
  heDisplacedThresholdFt: null,
}];

function movement(
  flightId: number,
  kind: AirportMovement["movement"],
  observedAt: string,
  runway: string | null = "29",
): AirportMovement {
  return {
    flightId,
    icaoHex: `ABC${flightId.toString().padStart(3, "0")}`,
    callsign: `TEST${flightId}`,
    registration: null,
    movement: kind,
    confidence: "medium",
    airport: "LOWW",
    runway: runway ? { designator: runway, status: "probable", confidence: "medium" } : null,
    observedAt,
    evidence: [],
  };
}

function operations(recentMovements: AirportMovement[] = []): AirportOperationsResponse {
  return {
    airport: { icao: "LOWW", name: "Vienna" },
    generatedAt: "2026-10-04T08:00:00.000Z",
    window: "24h",
    provenance: "INFERRED",
    complete: true,
    truncated: false,
    activity: "BUSY",
    likelyRunway: { designator: "29", confidence: "high", sampleCount: 7 },
    arrivals: recentMovements.filter((item) => item.movement === "LANDING" || item.movement === "APPROACH"),
    departures: recentMovements.filter((item) => item.movement === "TAKEOFF" || item.movement === "DEPARTURE"),
    approaches: recentMovements.filter((item) => item.movement === "APPROACH"),
    recentMovements,
    runwayUsage: [
      { designator: "29", arrivals: 5, departures: 2, total: 7 },
      { designator: "11", arrivals: 2, departures: 1, total: 3 },
    ],
    wind: [],
    goArounds: recentMovements.filter((item) => item.movement === "GO_AROUND"),
    holding: recentMovements.filter((item) => item.movement === "HOLDING"),
    diagnostics: { flightsExamined: 20, positionsExamined: 400, queryDurationMs: 12 },
  };
}

function metar(direction: number, speed = 12): MetarObservation {
  return {
    windDirectionDeg: direction,
    windSpeedKt: speed,
    windCalm: false,
    windVariable: false,
  } as MetarObservation;
}

describe("Airport Intelligence V3 composer", () => {
  it("compares receiver-inferred runway usage with the wind-favoured runway", () => {
    const result = buildAirportRunwayIntelligence(operations(), runways, metar(290));

    expect(result).toMatchObject({
      inferredRunway: "29",
      inferredCount: 7,
      inferredTotal: 10,
      confidence: "high",
      windFavoredRunway: "29",
      alignment: "aligned",
    });
    expect(result.inferredShare).toBeCloseTo(0.7);
    expect(result.windHeadwindKt).toBeGreaterThan(11);
  });

  it("reports disagreement without inferring a cause", () => {
    const result = buildAirportRunwayIntelligence(operations(), runways, metar(110));
    expect(result.windFavoredRunway).toBe("11");
    expect(result.inferredRunway).toBe("29");
    expect(result.alignment).toBe("different");
  });

  it("uses the existing operations wind projection when runway geometry is unavailable", () => {
    const data = {
      ...operations(),
      wind: [
        { directionDeg: 290, speedKt: 12, runway: "29", headwindKt: 12, crosswindKt: 0 },
        { directionDeg: 290, speedKt: 12, runway: "11", headwindKt: -12, crosswindKt: 0 },
      ],
    };
    const result = buildAirportRunwayIntelligence(data, [], metar(290));
    expect(result).toMatchObject({
      inferredRunway: "29",
      windFavoredRunway: "29",
      alignment: "aligned",
    });
  });

  it("stays unknown when wind or runway evidence is insufficient", () => {
    const noUsage = { ...operations(), likelyRunway: null, runwayUsage: [] };
    expect(buildAirportRunwayIntelligence(noUsage, runways, null)).toMatchObject({
      inferredRunway: null,
      windFavoredRunway: null,
      alignment: "unknown",
    });
  });

  it("builds bounded nearest-first NOW inbound and outbound lanes from live ADS-B observations", () => {
    const live = buildAirportActiveTrafficSnapshot([
      { aircraft: { icaoHex: "IN2" } as never, distanceKm: 12, bearingToAirport: 0, classification: "approaching" },
      { aircraft: { icaoHex: "OUT1" } as never, distanceKm: 8, bearingToAirport: 0, classification: "departing" },
      { aircraft: { icaoHex: "IN1" } as never, distanceKm: 5, bearingToAirport: 0, classification: "approaching" },
      { aircraft: { icaoHex: "OVER" } as never, distanceKm: 2, bearingToAirport: 0, classification: "overflying" },
    ], 2);
    expect(live.inbound.map((item) => item.aircraft.icaoHex)).toEqual(["IN1", "IN2"]);
    expect(live.outbound.map((item) => item.aircraft.icaoHex)).toEqual(["OUT1"]);
  });

  it("correlates live airport traffic only with fresh identity-safe compatible movements", () => {
    const liveAt = "2026-10-04T08:10:00.000Z";
    const observations = [
      {
        aircraft: { icaoHex: "ABC001", callsign: "TEST1", lastSeen: liveAt } as never,
        distanceKm: 5,
        bearingToAirport: 0,
        classification: "approaching" as const,
      },
      {
        aircraft: { icaoHex: "ABC002", callsign: "TEST2", lastSeen: liveAt } as never,
        distanceKm: 7,
        bearingToAirport: 0,
        classification: "departing" as const,
      },
    ];
    const data = operations([
      movement(11, "APPROACH", "2026-10-04T08:05:00.000Z"),
      movement(12, "DEPARTURE", "2026-10-04T08:04:00.000Z"),
    ]);
    data.recentMovements[0] = { ...data.recentMovements[0], icaoHex: "ABC001", callsign: "TEST1" };
    data.recentMovements[1] = { ...data.recentMovements[1], icaoHex: "ABC002", callsign: "TEST2" };

    const correlated = buildAirportCorrelatedTrafficSnapshot(observations, data);
    expect(correlated.inbound[0]).toMatchObject({
      movement: { flightId: 11, movement: "APPROACH" },
      movementAgeSeconds: 300,
    });
    expect(correlated.outbound[0]).toMatchObject({
      movement: { flightId: 12, movement: "DEPARTURE" },
      movementAgeSeconds: 360,
    });
  });

  it("keeps active traffic live-only when correlation is stale, identity-conflicting, or direction-incompatible", () => {
    const observation = {
      aircraft: { icaoHex: "ABC001", callsign: "LIVE1", lastSeen: "2026-10-04T08:30:00.000Z" } as never,
      distanceKm: 5,
      bearingToAirport: 0,
      classification: "approaching" as const,
    };
    const stale = movement(21, "APPROACH", "2026-10-04T08:00:00.000Z");
    const wrongCallsign = { ...movement(22, "APPROACH", "2026-10-04T08:25:00.000Z"), icaoHex: "ABC001", callsign: "OTHER" };
    const wrongDirection = { ...movement(23, "DEPARTURE", "2026-10-04T08:26:00.000Z"), icaoHex: "ABC001", callsign: "LIVE1" };
    const data = operations([
      { ...stale, icaoHex: "ABC001", callsign: "LIVE1" },
      wrongCallsign,
      wrongDirection,
    ]);

    const correlated = buildAirportCorrelatedTrafficSnapshot([observation], data);
    expect(correlated.inbound[0]).toMatchObject({ movement: null, movementAgeSeconds: null });
  });

  it("correlates a live outbound climb with a recent go-around Flight Story", () => {
    const observation = {
      aircraft: { icaoHex: "ABC777", callsign: "MISSED1", lastSeen: "2026-10-04T08:10:00.000Z" } as never,
      distanceKm: 6,
      bearingToAirport: 0,
      classification: "departing" as const,
    };
    const goAround = { ...movement(77, "GO_AROUND", "2026-10-04T08:08:00.000Z"), icaoHex: "ABC777", callsign: "MISSED1" };
    const correlated = buildAirportCorrelatedTrafficSnapshot([observation], operations([goAround]));

    expect(correlated.outbound[0].movement).toMatchObject({ flightId: 77, movement: "GO_AROUND" });
  });

  it("derives FINAL only from a fresh correlated approach with close descending live geometry", () => {
    const approach = { ...movement(81, "APPROACH", "2026-10-04T08:08:00.000Z"), icaoHex: "ABC081", callsign: "FINAL81" };
    const observation = {
      aircraft: {
        icaoHex: "ABC081",
        callsign: "FINAL81",
        lastSeen: "2026-10-04T08:10:00.000Z",
        verticalRate: -700,
        enrichment: { route: { origin: "LKPR", destination: "LOWW" } },
      } as never,
      distanceKm: 6,
      bearingToAirport: 0,
      classification: "approaching" as const,
    };
    const correlated = buildAirportCorrelatedTrafficSnapshot([observation], operations([approach]));
    expect(correlated.inbound[0].journey).toEqual({
      stage: "FINAL",
      routeRelation: "CONFIRMED",
      origin: "LKPR",
      destination: "LOWW",
    });
  });

  it("keeps a correlated approach at APPROACH outside the final geometry guard", () => {
    const approach = { ...movement(82, "APPROACH", "2026-10-04T08:08:00.000Z"), icaoHex: "ABC082", callsign: "APP82" };
    const observation = {
      aircraft: {
        icaoHex: "ABC082",
        callsign: "APP82",
        lastSeen: "2026-10-04T08:10:00.000Z",
        verticalRate: -700,
      } as never,
      distanceKm: 12,
      bearingToAirport: 0,
      classification: "approaching" as const,
    };
    const correlated = buildAirportCorrelatedTrafficSnapshot([observation], operations([approach]));
    expect(correlated.inbound[0].journey.stage).toBe("APPROACH");
  });

  it("preserves GO_AROUND journey state even when route metadata conflicts with the airport", () => {
    const goAround = { ...movement(83, "GO_AROUND", "2026-10-04T08:08:00.000Z"), icaoHex: "ABC083", callsign: "GA83" };
    const observation = {
      aircraft: {
        icaoHex: "ABC083",
        callsign: "GA83",
        lastSeen: "2026-10-04T08:10:00.000Z",
        verticalRate: 1200,
        enrichment: { route: { origin: "LKPR", destination: "EDDM" } },
      } as never,
      distanceKm: 7,
      bearingToAirport: 0,
      classification: "departing" as const,
    };
    const correlated = buildAirportCorrelatedTrafficSnapshot([observation], operations([goAround]));
    expect(correlated.outbound[0].journey).toMatchObject({
      stage: "GO_AROUND",
      routeRelation: "CONFLICT",
      origin: "LKPR",
      destination: "EDDM",
    });
  });

  it("distinguishes initial climb from generic outbound traffic", () => {
    const takeoff = { ...movement(84, "TAKEOFF", "2026-10-04T08:09:00.000Z"), icaoHex: "ABC084", callsign: "TO84" };
    const departure = { ...movement(85, "DEPARTURE", "2026-10-04T08:09:00.000Z"), icaoHex: "ABC085", callsign: "DEP85" };
    const observations = [
      {
        aircraft: { icaoHex: "ABC084", callsign: "TO84", lastSeen: "2026-10-04T08:10:00.000Z" } as never,
        distanceKm: 3,
        bearingToAirport: 0,
        classification: "departing" as const,
      },
      {
        aircraft: { icaoHex: "ABC085", callsign: "DEP85", lastSeen: "2026-10-04T08:10:00.000Z" } as never,
        distanceKm: 14,
        bearingToAirport: 0,
        classification: "departing" as const,
      },
    ];
    const correlated = buildAirportCorrelatedTrafficSnapshot(observations, operations([takeoff, departure]));
    expect(correlated.outbound.map((item) => item.journey.stage)).toEqual(["INITIAL_CLIMB", "OUTBOUND"]);
  });

  it("builds bounded deduplicated live-board arrival and departure lanes", () => {
    const data = operations([
      movement(1, "APPROACH", "2026-10-04T07:00:00.000Z"),
      movement(1, "LANDING", "2026-10-04T07:05:00.000Z"),
      movement(2, "APPROACH", "2026-10-04T07:04:00.000Z"),
      movement(3, "TAKEOFF", "2026-10-04T07:03:00.000Z"),
      movement(3, "DEPARTURE", "2026-10-04T07:06:00.000Z"),
      movement(4, "DEPARTURE", "not-a-time"),
    ]);

    const live = buildAirportLiveBoardSnapshot(data);
    expect(live.arrivals.map((item) => [item.flightId, item.movement])).toEqual([
      [1, "LANDING"],
      [2, "APPROACH"],
    ]);
    expect(live.departures.map((item) => [item.flightId, item.movement])).toEqual([
      [3, "DEPARTURE"],
    ]);
  });

  it("keeps operational attention events and runway usage bounded and ordered", () => {
    const data = operations([
      movement(1, "HOLDING", "2026-10-04T07:00:00.000Z", null),
      movement(2, "GO_AROUND", "2026-10-04T07:10:00.000Z"),
      movement(3, "LANDING", "2026-10-04T07:20:00.000Z"),
    ]);
    data.runwayUsage = [
      { designator: "11", arrivals: 2, departures: 1, total: 3 },
      { designator: "29", arrivals: 7, departures: 2, total: 9 },
      { designator: "16", arrivals: 0, departures: 0, total: 0 },
    ];

    const live = buildAirportLiveBoardSnapshot(data, 1);
    expect(live.attention.map((item) => item.movement)).toEqual(["GO_AROUND"]);
    expect(live.runwayUsage.map((item) => item.designator)).toEqual(["29", "11"]);
  });

  it("builds a bounded newest-first unified movement timeline and drops invalid timestamps", () => {
    const data = operations([
      movement(1, "LANDING", "2026-10-04T07:00:00.000Z"),
      movement(2, "GO_AROUND", "2026-10-04T07:20:00.000Z"),
      movement(3, "HOLDING", "not-a-time", null),
      movement(4, "TAKEOFF", "2026-10-04T07:10:00.000Z"),
    ]);

    const timeline = buildAirportOperationsTimeline(data, 2);
    expect(timeline).toHaveLength(2);
    expect(timeline.map((item) => item.movement.flightId)).toEqual([2, 4]);
  });
});
