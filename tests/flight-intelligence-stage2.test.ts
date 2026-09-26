import { describe, expect, it } from "vitest";
import type { Aircraft } from "@/lib/aircraft/types";
import { detectGoAround } from "@/lib/intelligence/go-around";
import type { FlightObservation } from "@/lib/intelligence/types";
import { AIRPORT_VECTORING, GO_AROUND, NORMAL_LANDING, TOUCH_AND_GO_LIKE } from "./fixtures/flight-intelligence-stage2";

const BASE = Date.parse("2026-09-26T12:00:00.000Z");
const airport = { icao: "LKPR", latitude: 50.100, longitude: 14.260 };

function observation(points: readonly (readonly [number, number, number, number])[]): FlightObservation[] {
  return points.map(([lat, lon, altitude, verticalRate], index) => ({
    observedAt: BASE + index * 60_000,
    aircraft: {
      icaoHex: "ABC123", callsign: "TEST01", registration: null, aircraftType: null,
      aircraftDescription: null, lat, lon, altitude, baroAltitude: altitude, geomAltitude: altitude,
      groundSpeed: 130, track: 260, verticalRate, baroRate: verticalRate, geomRate: verticalRate,
      squawk: null, category: null, emergency: null, rssi: null, messages: null, seenSeconds: 0,
      seenPosSeconds: 0, lastSeen: new Date(BASE + index * 60_000).toISOString(), source: "ADS-B",
      origin: "local", sourceType: null, onGround: false, distanceKm: null, bearing: null, trail: [],
    } satisfies Aircraft,
  }));
}

describe("go-around episode detector", () => {
  it("detects a sustained climb after a low approach", () => {
    expect(detectGoAround(observation(GO_AROUND), airport)).toMatchObject({
      type: "GO_AROUND_DETECTED", airport: "LKPR", confidence: expect.any(Number),
      reasonCodes: expect.arrayContaining(["sustained_positive_vertical_rate", "moved_away_after_closest_approach"]),
    });
  });

  it("accepts an approach without a go-around and rejects a single high climb", () => {
    expect(detectGoAround(observation(NORMAL_LANDING), airport)).toBeNull();
    expect(detectGoAround(observation([[50.20, 14.20, 9_000, 1_200]]), airport)).toBeNull();
  });

  it("does not infer a go-around from touch-and-go-like or vectoring data", () => {
    expect(detectGoAround(observation(TOUCH_AND_GO_LIKE), airport)).toBeNull();
    expect(detectGoAround(observation(AIRPORT_VECTORING), airport)).toBeNull();
  });

  it("requires a known airport and fresh position", () => {
    expect(detectGoAround(observation(GO_AROUND))).toBeNull();
    const stale = observation(GO_AROUND);
    stale.at(-1)!.aircraft.seenPosSeconds = 90;
    expect(detectGoAround(stale, airport)).toBeNull();
  });
});
