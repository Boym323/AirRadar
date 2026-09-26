import { describe, expect, it } from "vitest";
import type { Aircraft } from "@/lib/aircraft/types";
import { FlightIntelligenceDetector } from "@/lib/intelligence/detector";
import { HOLDING_TRAJECTORY, LARGE_VECTORING_TURN, LEVEL_OFF_SEQUENCE } from "./fixtures/flight-intelligence-stage1";

const BASE = Date.parse("2026-09-17T12:00:00.000Z");

function aircraft(overrides: Partial<Aircraft> = {}): Aircraft {
  return {
    icaoHex: "ABC123", callsign: "TEST01", registration: null, aircraftType: null,
    aircraftDescription: null, lat: 50.1, lon: 14.3, altitude: 4_000,
    baroAltitude: 4_000, geomAltitude: 4_000, groundSpeed: 180, track: 90,
    verticalRate: 0, baroRate: 0, geomRate: 0, squawk: null, category: null,
    emergency: null, rssi: null, messages: null, seenSeconds: 0, seenPosSeconds: 0,
    lastSeen: new Date(BASE).toISOString(), source: "ADS-B", origin: "local",
    sourceType: null, onGround: false, distanceKm: 10, bearing: 90, trail: [],
    ...overrides,
  };
}

function observe(detector: FlightIntelligenceDetector, value: Partial<Aircraft>, index: number, stepMs = 30_000) {
  return detector.observe(undefined, aircraft({ ...value, lastSeen: new Date(BASE + index * stepMs).toISOString() }), BASE + index * stepMs);
}

describe("flight intelligence V2 stage 1", () => {
  it("emits one level-off after a sustained climb and does not flap", () => {
    const detector = new FlightIntelligenceDetector([]);
    const events = LEVEL_OFF_SEQUENCE.flatMap((value, index) => observe(detector, value, index, 60_000));
    expect(events.filter((event) => event.type === "LEVEL_OFF")).toHaveLength(1);
    expect(events.find((event) => event.type === "LEVEL_OFF")).toMatchObject({
      reasonCodes: expect.arrayContaining(["intelligence.evidence.levelOffAfterClimb"]),
    });
  });

  it("returns UNKNOWN and emits no intelligence after stale or discontinuous input", () => {
    const stale = new FlightIntelligenceDetector([]);
    observe(stale, { altitude: 5_000 }, 0);
    expect(observe(stale, { altitude: 5_100, seenPosSeconds: 90 }, 1)).toEqual([]);
    expect(stale.getFlightPhase("ABC123")).toBe("UNKNOWN");

    const discontinuous = new FlightIntelligenceDetector([]);
    observe(discontinuous, { lat: 50, lon: 14, altitude: 5_000 }, 0);
    expect(observe(discontinuous, { lat: 51, lon: 15, altitude: 5_100 }, 1)).toEqual([]);
    expect(discontinuous.getFlightPhase("ABC123")).toBe("UNKNOWN");
  });

  it("does not infer a level-off when vertical rate is unavailable", () => {
    const detector = new FlightIntelligenceDetector([]);
    const events = [0, 1, 2, 3].flatMap((index) => observe(detector, { altitude: 5_000 + index * 100, verticalRate: null }, index, 60_000));
    expect(events.some((event) => event.type === "LEVEL_OFF")).toBe(false);
  });

  it("exposes holding candidate, confirmed, and ended lifecycle without per-update duplicates", () => {
    const detector = new FlightIntelligenceDetector([]);
    const events = HOLDING_TRAJECTORY.flatMap(([lat, lon, track], index) => observe(detector, { lat, lon, track, altitude: 4_000 }, index));
    const continued = [
      [50.30, 14.30, 90],
      [50.40, 14.30, 90],
    ] as const;
    continued.forEach(([lat, lon, track], offset) => events.push(...observe(detector, { lat, lon, track, altitude: 4_000 }, HOLDING_TRAJECTORY.length + offset + 1)));
    expect(events.filter((event) => event.type === "HOLDING_CANDIDATE")).toHaveLength(1);
    expect(events.filter((event) => event.type === "HOLDING")).toHaveLength(1);
    expect(events.filter((event) => event.type === "HOLDING_ENDED")).toHaveLength(1);
    expect(events.find((event) => event.type === "HOLDING")?.metadata).toMatchObject({ holdingStatus: "HOLDING_CONFIRMED" });
  });

  it("reports a large turn as unusual without calling it a holding", () => {
    const detector = new FlightIntelligenceDetector([]);
    const events = LARGE_VECTORING_TURN.flatMap(([lat, lon, track], index) => observe(detector, { lat, lon, track, altitude: 8_000 }, index));
    expect(events.some((event) => event.type === "UNUSUAL_TURN")).toBe(true);
    expect(events.some((event) => event.type === "HOLDING")).toBe(false);
  });
});
