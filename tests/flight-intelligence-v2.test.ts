import { describe, expect, it } from "vitest";
import type { Aircraft } from "@/lib/aircraft/types";
import type { AirportRunway } from "@/lib/airports/infrastructure";
import type { Airport } from "@/lib/airports/types";
import { FlightIntelligenceDetector } from "@/lib/intelligence/detector";

const LKPR: Airport = { icaoCode: "LKPR", iataCode: "PRG", name: "Prague", city: "Prague", country: "CZ", latitude: 50, longitude: 14, elevationFt: 1_200 };
const LKKV: Airport = { icaoCode: "LKKV", iataCode: "KLV", name: "Karlovy Vary", city: "Karlovy Vary", country: "CZ", latitude: 50.2, longitude: 14.27, elevationFt: 1_900 };
const runway24: AirportRunway = { id: 1, airportId: 1, sourceAirportIdent: "LKPR", lengthFt: 10_000, widthFt: 150, surface: "ASP", lighted: true, closed: false, leIdent: "06", leLatitude: 49.999, leLongitude: 13.99, leElevationFt: 1_200, leHeadingDegT: 60, leDisplacedThresholdFt: null, heIdent: "24", heLatitude: 50.001, heLongitude: 14.01, heElevationFt: 1_200, heHeadingDegT: 240, heDisplacedThresholdFt: null };

function aircraft(overrides: Partial<Aircraft> = {}): Aircraft {
  return { icaoHex: "ABC123", callsign: "TEST01", registration: null, aircraftType: null, aircraftDescription: null, lat: 50.4, lon: 14.4, altitude: 8_000, baroAltitude: 8_000, geomAltitude: 8_000, groundSpeed: 220, track: 240, verticalRate: 0, baroRate: 0, geomRate: 0, squawk: null, category: null, emergency: null, rssi: null, messages: null, seenSeconds: 0, seenPosSeconds: 0, lastSeen: "2026-09-17T12:00:00.000Z", source: "ADS-B", origin: "local", sourceType: null, onGround: false, distanceKm: 40, bearing: 240, trail: [], ...overrides };
}

function observeSequence(detector: FlightIntelligenceDetector, values: Array<Partial<Aircraft>>, stepSeconds = 60, startIso = "2026-09-17T12:00:00.000Z"): string[] {
  const start = Date.parse(startIso);
  return values.flatMap((value, index) => detector.observe(undefined, aircraft({ ...value, lastSeen: new Date(start + index * stepSeconds * 1000).toISOString() })).map((event) => event.type));
}

function collectEvents(detector: FlightIntelligenceDetector, values: Array<Partial<Aircraft>>, stepSeconds = 60, startIso = "2026-09-17T12:00:00.000Z") {
  const start = Date.parse(startIso);
  return values.flatMap((value, index) => detector.observe(undefined, aircraft({ ...value, lastSeen: new Date(start + index * stepSeconds * 1000).toISOString() })));
}

describe("flight intelligence V2", () => {
  it("moves through a confirmed phase lifecycle without flapping", () => {
    const detector = new FlightIntelligenceDetector([LKPR]);
    const first = detector.observe(undefined, aircraft({ lat: 50, lon: 14, altitude: 0, onGround: true }));
    expect(first).toEqual([]);
    const firstClimb = detector.observe(undefined, aircraft({ lat: 50.01, lon: 14.01, altitude: 600, verticalRate: 800, onGround: false, lastSeen: "2026-09-17T12:01:00.000Z" }));
    expect(firstClimb).toEqual([]);
    const takeoff = detector.observe(undefined, aircraft({ lat: 50.03, lon: 14.04, altitude: 2_000, verticalRate: 900, onGround: false, lastSeen: "2026-09-17T12:02:00.000Z" }));
    expect(takeoff.map((event) => event.type)).toContain("TAKEOFF");
    expect(detector.getPhase("abc123")).toBe("TAKEOFF");
    detector.observe(undefined, aircraft({ lat: 50.08, lon: 14.1, altitude: 3_000, verticalRate: -50, onGround: false, lastSeen: "2026-09-17T12:03:00.000Z" }));
    expect(detector.getPhase("ABC123")).toBe("TAKEOFF");
  });

  it("requires duration, bounded area, turn evolution, and stable altitude for holding", () => {
    const detector = new FlightIntelligenceDetector([LKPR]);
    const points = [[50.10, 14.30, 0], [50.12, 14.30, 45], [50.12, 14.34, 90], [50.10, 14.34, 135], [50.08, 14.30, 180], [50.08, 14.26, 225], [50.10, 14.26, 270], [50.12, 14.30, 315], [50.10, 14.30, 0]];
    const events = observeSequence(detector, points.map(([lat, lon, track]) => ({ lat, lon, track, altitude: 4_000 })), 30);
    expect(events.filter((event) => event === "HOLDING")).toHaveLength(1);

    const falsePositive = new FlightIntelligenceDetector([LKPR]);
    const straight = observeSequence(falsePositive, Array.from({ length: 10 }, (_, index) => ({ lat: 50.1 + index * 0.01, lon: 14.3, track: 90, altitude: 4_000 })), 30);
    expect(straight).not.toContain("HOLDING");
  });

  it("emits approach and landing only after the phase sequence is established", () => {
    const detector = new FlightIntelligenceDetector([LKPR]);
    const events = observeSequence(detector, [
      { lat: 50.25, lon: 14.25, altitude: 5_000, verticalRate: -700 },
      { lat: 50.15, lon: 14.1, altitude: 3_000, verticalRate: -650 },
      { lat: 50.08, lon: 14.03, altitude: 1_500, verticalRate: -450 },
      { lat: 50.02, lon: 14.01, altitude: 700, verticalRate: -250 },
      { lat: 50.001, lon: 14.001, altitude: 0, verticalRate: 0, groundSpeed: 40, onGround: true },
      { lat: 50.001, lon: 14.001, altitude: 0, verticalRate: 0, groundSpeed: 20, onGround: true },
    ]);
    expect(events).toContain("APPROACH");
    expect(events).toContain("LANDING");
    expect(detector.getPhase("ABC123")).toBe("GROUND");
    const nextTakeoff = observeSequence(detector, [
      { lat: 50.01, lon: 14.01, altitude: 600, verticalRate: 800, onGround: false },
      { lat: 50.03, lon: 14.04, altitude: 2_000, verticalRate: 900, onGround: false },
    ], 60, "2026-09-17T12:06:00.000Z");
    expect(nextTakeoff).toContain("TAKEOFF");
  });

  it("requires an established approach and movement away for go-around", () => {
    const detector = new FlightIntelligenceDetector([{ ...LKPR, latitude: 50.1008, longitude: 14.26 }]);
    const events = observeSequence(detector, [
      { lat: 50.25, lon: 14.26, altitude: 3_500, verticalRate: -900 },
      { lat: 50.14, lon: 14.26, altitude: 1_500, verticalRate: -700 },
      { lat: 50.105, lon: 14.26, altitude: 900, verticalRate: -300 },
      { lat: 50.16, lon: 14.26, altitude: 1_800, verticalRate: 1_200 },
    ]);
    expect(events).toContain("GO_AROUND");
    const loneClimb = new FlightIntelligenceDetector([LKPR]);
    expect(loneClimb.observe(undefined, aircraft({ altitude: 900, verticalRate: 1_200, lastSeen: "2026-09-17T12:00:00.000Z" }))).toEqual([]);
  });

  it("detects a diversion only when the alternate approach is established", () => {
    const detector = new FlightIntelligenceDetector([LKPR, LKKV]);
    const route = { callsign: "TEST01", airline: null, airlineIcao: null, airlineIata: null, origin: "LKPR", destination: "LKPR", originAirport: LKPR, destinationAirport: LKPR, source: "fixture" };
    const events = observeSequence(detector, [
      { lat: 50.35, lon: 14.4, altitude: 5_000, verticalRate: -700, enrichment: { route } },
      { lat: 50.27, lon: 14.32, altitude: 3_000, verticalRate: -650, enrichment: { route } },
      { lat: 50.21, lon: 14.28, altitude: 1_500, verticalRate: -450, enrichment: { route } },
      { lat: 50.2, lon: 14.27, altitude: 800, verticalRate: -250, enrichment: { route } },
      { lat: 50.2, lon: 14.27, altitude: 700, verticalRate: -150, enrichment: { route } },
    ]);
    expect(events).toContain("DIVERSION");
  });

  it("attaches a positive runway context but withholds ambiguous runway display", () => {
    const reportedPlan = { callsign: "TEST01", scheduledDeparture: null, actualDeparture: null, scheduledArrival: null, estimatedArrival: null, filedRoute: null, waypoints: [], flightAware: { operational: { arrivalRunway: "RWY 24" } } };
    const positive = new FlightIntelligenceDetector([LKPR], new Map([["LKPR", [runway24]]]));
    const positiveEvents = collectEvents(positive, [
      { lat: 50.2, lon: 14.2, altitude: 3_000, verticalRate: -500, enrichment: { flightPlan: reportedPlan } },
      { lat: 50.08, lon: 14.05, altitude: 1_500, verticalRate: -450, enrichment: { flightPlan: reportedPlan } },
      { lat: 50.02, lon: 14.01, altitude: 700, verticalRate: -250, enrichment: { flightPlan: reportedPlan } },
      { lat: 50.01, lon: 14.01, altitude: 500, verticalRate: -150, enrichment: { flightPlan: reportedPlan } },
    ]);
    const positiveApproach = positiveEvents.find((event) => event.type === "APPROACH");
    expect(positiveApproach?.runway).toBe("24");

    const ambiguousPlan = { ...reportedPlan, flightAware: { operational: { arrivalRunway: "RWY 06" } } };
    const ambiguous = new FlightIntelligenceDetector([LKPR], new Map([["LKPR", [runway24]]]));
    const start = Date.parse("2026-09-17T12:00:00.000Z");
    const emitted = [
      [50.2, 14.2, 3_000, -500], [50.08, 14.05, 1_500, -450], [50.02, 14.01, 700, -250], [50.01, 14.01, 500, -150],
    ].flatMap(([lat, lon, altitude, verticalRate], index) => ambiguous.observe(undefined, aircraft({ lat, lon, altitude, verticalRate, enrichment: { flightPlan: ambiguousPlan }, lastSeen: new Date(start + index * 60_000).toISOString() })));
    expect(emitted.find((event) => event.type === "APPROACH")?.runway).toBeNull();
  });

  it("uses semantic lifecycle keys so repeated observations do not duplicate events", () => {
    const detector = new FlightIntelligenceDetector([LKPR]);
    const values = [
      { lat: 50.25, lon: 14.25, altitude: 5_000, verticalRate: -700 },
      { lat: 50.15, lon: 14.1, altitude: 3_000, verticalRate: -650 },
      { lat: 50.08, lon: 14.03, altitude: 1_500, verticalRate: -450 },
      { lat: 50.02, lon: 14.01, altitude: 700, verticalRate: -250 },
      { lat: 50.001, lon: 14.001, altitude: 0, verticalRate: 0, groundSpeed: 40, onGround: true },
    ];
    const types = observeSequence(detector, [...values, ...values.map((value) => ({ ...value, lat: value.lat! + 0.0001 }))]);
    expect(types.filter((type) => type === "APPROACH")).toHaveLength(1);
  });

  it("starts a new semantic lifecycle after an inactive track is cleaned up", () => {
    const detector = new FlightIntelligenceDetector([LKPR]);
    const atc = { sectorId: "PRAHA-TMA" } as Aircraft["atc"];
    const first = collectEvents(detector, [
      { atc },
      { atc },
      { atc },
    ]);
    expect(first).toHaveLength(1);
    detector.cleanup(new Set());
    const second = collectEvents(detector, [
      { atc },
      { atc },
      { atc },
    ], 60, "2026-09-17T13:00:00.000Z");
    expect(second).toHaveLength(1);
    expect(second[0]?.eventKey).not.toBe(first[0]?.eventKey);
  });
});
