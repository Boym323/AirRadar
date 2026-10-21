import { describe, expect, it } from "vitest";
import type { AircraftView } from "@/lib/aircraft/types";
import { buildLogbookSummary } from "@/lib/server/logbook-summary";

function liveAircraft(icaoHex: string): AircraftView {
  return { icaoHex, registration: null, callsign: null, aircraftType: null, aircraftDescription: null, lat: null, lon: null, altitude: null, baroAltitude: null, geomAltitude: null, groundSpeed: null, track: null, verticalRate: null, baroRate: null, geomRate: null, squawk: null, category: null, emergency: null, rssi: null, messages: null, seenSeconds: null, seenPosSeconds: null, lastSeen: "2026-09-08T12:00:00.000Z", source: "ADS-B", sourceType: null, onGround: false, distanceKm: null, bearing: null } as AircraftView;
}

function liveInterestingAircraft(): AircraftView {
  return { ...liveAircraft("ABC123"), registration: "OK-ABC", callsign: "TEST123", aircraftType: "A320", emergency: "7500", distanceKm: 100 };
}

describe("dashboard logbook summary", () => {
  it("counts durable statuses independently of retired watchlist rules", () => {
    const result = buildLogbookSummary({
      liveAircraft: [liveAircraft("ABC123"), liveAircraft("DEF456")],
      stats: { currentAircraft: 2, uniqueAircraftToday: 4 },
      evidence: [
        { icaoHex: "ABC123", firstObservedAt: "2026-09-08T00:01:00Z", flightCount: 1, returningGapDays: null },
        { icaoHex: "DEF456", firstObservedAt: "2026-09-07T12:00:00Z", flightCount: 3, returningGapDays: 30 },
        { icaoHex: "FEDCBA", firstObservedAt: "2026-09-07T12:00:00Z", flightCount: 4, returningGapDays: null },
      ],
      source: "postgres",
      now: new Date("2026-09-08T12:00:00Z"),
    });

    expect(result).toMatchObject({ source: "postgres", liveAircraft: 2, uniqueAircraftToday: 4, newAircraftToday: 1, rareAircraftToday: 1, returningAircraftToday: 1, watchlistedLiveAircraft: 0 });
    expect(result.interestingAircraft.map((aircraft) => [aircraft.icaoHex, aircraft.labels])).toEqual([
      ["ABC123", ["new"]],
      ["DEF456", ["rare", "returning"]],
    ]);
  });

  it("keeps a degraded summary safe when durable evidence is unavailable", () => {
    const result = buildLogbookSummary({ liveAircraft: [], stats: { currentAircraft: 0, uniqueAircraftToday: 2 }, evidence: [], source: "unavailable", now: new Date("2026-09-08T12:00:00Z") });
    expect(result).toMatchObject({ source: "unavailable", uniqueAircraftToday: 2, newAircraftToday: 0, rareAircraftToday: 0, returningAircraftToday: 0, interestingAircraft: [] });
  });

  it("retains emergency highlights without obsolete reception records", () => {
    const result = buildLogbookSummary({
      liveAircraft: [liveInterestingAircraft()],
      stats: { currentAircraft: 1, uniqueAircraftToday: 1 },
      evidence: [],
      source: "memory",
      now: new Date("2026-09-08T12:00:00Z"),
    });
    expect(result.interestingAircraft[0]).toMatchObject({ icaoHex: "ABC123", isLive: true, reasons: ["emergency"] });
  });
});
