import { describe, expect, it } from "vitest";
import type { AircraftView } from "@/lib/aircraft/types";
import type { Airport } from "@/lib/airports/types";
import { buildAirportTerminalDemandHorizonV9 } from "@/lib/server/airport-terminal-demand-horizon-v9";

const now = new Date("2026-10-06T10:00:00.000Z");
const airport = {
  icaoCode: "LKPR",
  iataCode: "PRG",
  name: "Prague",
  latitude: 50.1008,
  longitude: 14.26,
} as Airport;

function aircraft(input: {
  hex: string;
  lat: number;
  destination?: string;
  speed?: number | null;
  track?: number | null;
  lastSeen?: string;
  onGround?: boolean;
  seenPosSeconds?: number | null;
}): AircraftView {
  return {
    icaoHex: input.hex,
    callsign: input.hex,
    registration: null,
    lat: input.lat,
    lon: 14.26,
    altitude: 20_000,
    baroAltitude: 20_000,
    geomAltitude: null,
    groundSpeed: input.speed === undefined ? 200 : input.speed,
    track: input.track === undefined ? 180 : input.track,
    verticalRate: 0,
    onGround: input.onGround ?? false,
    seenPosSeconds: input.seenPosSeconds === undefined ? 5 : input.seenPosSeconds,
    lastSeen: input.lastSeen ?? now.toISOString(),
    enrichment: input.destination ? { route: { destination: input.destination } } : undefined,
  } as AircraftView;
}

describe("Airport Terminal Demand Horizon V9", () => {
  it("extends inbound coverage using fresh LOCAL route-destination evidence", () => {
    const result = buildAirportTerminalDemandHorizonV9({
      airport,
      now,
      liveAircraft: [
        aircraft({ hex: "AAA111", lat: 50.6, destination: "LKPR", speed: 220 }),
        aircraft({ hex: "BBB222", lat: 52.0, destination: "PRG", speed: 240 }),
        aircraft({ hex: "CCC333", lat: 50.8, destination: "LKPR", speed: null }),
        aircraft({ hex: "OTHER1", lat: 50.5, destination: "LOWW", speed: 220 }),
      ],
    });

    expect(result.coverage).toMatchObject({
      localAircraft: 4,
      routeMatchedInbound: 3,
      etaEstimated: 2,
    });
    expect(result.demand.within30Minutes).toBeGreaterThanOrEqual(1);
    expect(result.demand.within60Minutes).toBe(2);
    expect(result.demand.unknownEta).toBe(1);
    expect(result.items.map((item) => item.icaoHex)).not.toContain("OTHER1");
  });

  it("excludes stale, on-ground and stale-position route matches", () => {
    const result = buildAirportTerminalDemandHorizonV9({
      airport,
      now,
      liveAircraft: [
        aircraft({ hex: "GROUND", lat: 50.2, destination: "LKPR", onGround: true }),
        aircraft({ hex: "STALE1", lat: 50.2, destination: "LKPR", lastSeen: "2026-10-06T09:50:00.000Z" }),
        aircraft({ hex: "STALE2", lat: 50.2, destination: "LKPR", seenPosSeconds: 90 }),
      ],
    });
    expect(result.coverage.routeMatchedInbound).toBe(0);
    expect(result.items).toEqual([]);
  });

  it("keeps direct ETA visibly non-public and bounded", () => {
    const result = buildAirportTerminalDemandHorizonV9({
      airport,
      now,
      liveAircraft: [
        aircraft({ hex: "AAA111", lat: 50.6, destination: "LKPR", speed: 220 }),
      ],
    });
    expect(result.items[0]).toMatchObject({
      estimateBasis: "DIRECT_DISTANCE_GROUNDSPEED",
      routeDestination: "LKPR",
      trackRelation: "TOWARD",
    });
    expect(result.limitations).toContain("NOT_PUBLIC_PREDICTION");
    expect(result.limitations).toContain("NOT_ATC_SEQUENCE");
    expect(result.limitations).toContain("NO_CAPACITY_OR_DELAY_INFERENCE");
  });

  it("caps the rendered horizon while preserving truncation truth", () => {
    const liveAircraft = Array.from({ length: 14 }, (_, index) =>
      aircraft({
        hex: index.toString(16).toUpperCase().padStart(6, "0"),
        lat: 50.3 + index * 0.01,
        destination: "LKPR",
        speed: 180,
      }));
    const result = buildAirportTerminalDemandHorizonV9({ airport, liveAircraft, now });
    expect(result.coverage.routeMatchedInbound).toBe(14);
    expect(result.items).toHaveLength(12);
    expect(result.truncated).toBe(true);
  });
  it("never treats crossing, away or unknown track as a direct-distance arrival ETA", () => {
    const result = buildAirportTerminalDemandHorizonV9({
      airport,
      now,
      liveAircraft: [
        aircraft({ hex: "TOWARD", lat: 50.6, destination: "LKPR", track: 180 }),
        aircraft({ hex: "CROSSING", lat: 50.6, destination: "LKPR", track: 90 }),
        aircraft({ hex: "AWAY", lat: 50.6, destination: "LKPR", track: 0 }),
        aircraft({ hex: "UNKNOWN", lat: 50.6, destination: "LKPR", track: null }),
        aircraft({ hex: "INVALID", lat: 50.6, destination: "LKPR", track: 999 }),
      ],
    });
    expect(result.coverage.routeMatchedInbound).toBe(5);
    expect(result.coverage.etaEstimated).toBe(1);
    expect(result.demand.unknownEta).toBe(4);
    expect(result.items.find((item) => item.icaoHex === "TOWARD")?.etaMinutes).not.toBeNull();
    for (const hex of ["CROSSING", "AWAY", "UNKNOWN", "INVALID"]) {
      expect(result.items.find((item) => item.icaoHex === hex)?.etaMinutes).toBeNull();
    }
  });

  it("does not accept future observations, unverified position age or invalid coordinates", () => {
    const result = buildAirportTerminalDemandHorizonV9({
      airport,
      now,
      liveAircraft: [
        aircraft({ hex: "FUTURE", lat: 50.6, destination: "LKPR", lastSeen: "2026-10-06T10:01:00.000Z" }),
        aircraft({ hex: "NOAGE", lat: 50.6, destination: "LKPR", seenPosSeconds: null }),
        aircraft({ hex: "NEGAGE", lat: 50.6, destination: "LKPR", seenPosSeconds: -1 }),
        aircraft({ hex: "BADLAT", lat: 95, destination: "LKPR" }),
        aircraft({ hex: "VALID1", lat: 50.6, destination: "LKPR", seenPosSeconds: 0 }),
      ],
    });
    expect(result.coverage.routeMatchedInbound).toBe(1);
    expect(result.items.map((item) => item.icaoHex)).toEqual(["VALID1"]);
  });

});
