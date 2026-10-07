import { describe, expect, it } from "vitest";
import type { AircraftView } from "@/lib/aircraft/types";
import { isSpotterInteresting, scoreSpotterInterest } from "@/lib/spotter-interest";

function aircraft(overrides: Partial<AircraftView> = {}): AircraftView {
  return {
    icaoHex: "ABC123",
    callsign: "EK139",
    registration: "A6-EVK",
    aircraftType: "A388",
    aircraftDescription: null,
    lat: 50,
    lon: 14,
    altitude: 9000,
    baroAltitude: 9000,
    geomAltitude: null,
    groundSpeed: 230,
    track: 90,
    verticalRate: -1000,
    baroRate: -1000,
    geomRate: null,
    squawk: "1000",
    category: null,
    emergency: null,
    rssi: null,
    messages: 10,
    seenSeconds: 0,
    seenPosSeconds: 0,
    lastSeen: "2026-10-07T12:00:00Z",
    source: "ADS-B",
    origin: "local",
    sourceType: null,
    onGround: false,
    distanceKm: 10,
    bearing: 90,
    ...overrides,
  };
}

describe("Spotter Interest V1", () => {
  it("makes an A380 close pass explainably interesting", () => {
    const result = scoreSpotterInterest(aircraft(), ["rare"], 1.5);
    expect(result.score).toBe(80);
    expect(result.reasons.map((reason) => reason.code)).toEqual([
      "rare",
      "iconic_type",
      "close_pass",
    ]);
    expect(isSpotterInteresting(result)).toBe(true);
  });

  it("prioritizes emergency evidence", () => {
    const result = scoreSpotterInterest(aircraft({ aircraftType: "A320", squawk: "7700" }), [], 20);
    expect(result.score).toBe(60);
    expect(result.reasons[0]).toEqual({ code: "emergency", points: 60 });
  });

  it("keeps routine narrowbody traffic below the recommendation threshold", () => {
    const result = scoreSpotterInterest(aircraft({ aircraftType: "A320" }), [], 15);
    expect(result.score).toBe(0);
    expect(isSpotterInteresting(result)).toBe(false);
  });

  it("caps combined evidence at 100", () => {
    const result = scoreSpotterInterest(
      aircraft({ squawk: "7700" }),
      ["rare", "new", "returning"],
      0.5,
      "ABC123",
    );
    expect(result.score).toBe(100);
  });
});
