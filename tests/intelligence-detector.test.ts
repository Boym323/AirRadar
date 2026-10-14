import { describe, expect, it } from "vitest";
import type { Aircraft } from "@/lib/aircraft/types";
import { haversineDistanceKm } from "@/lib/geo";
import type { Airport } from "@/lib/airports/types";
import { FlightIntelligenceDetector } from "@/lib/intelligence/detector";

function aircraft(overrides: Partial<Aircraft> = {}): Aircraft {
  return { icaoHex: "ABC123", callsign: "TEST01", registration: null, aircraftType: null, aircraftDescription: null, lat: 50.1, lon: 14.3, altitude: 5000, baroAltitude: 5000, geomAltitude: 5000, groundSpeed: 180, track: 90, verticalRate: 0, baroRate: 0, geomRate: 0, squawk: null, category: null, emergency: null, rssi: null, messages: null, seenSeconds: 0, seenPosSeconds: 0, lastSeen: "2026-09-17T12:00:00.000Z", source: "ADS-B", origin: "local", sourceType: null, onGround: false, distanceKm: 10, bearing: 90, trail: [], ...overrides };
}

function airport(icaoCode: string, latitude: number, longitude: number): Airport {
  return { icaoCode, iataCode: null, name: icaoCode, city: null, country: null, latitude, longitude };
}

function nearestLinear(airports: readonly Airport[], item: Aircraft) {
  if (item.lat === null || item.lon === null) return null;
  let best: { airport: Airport; distanceKm: number } | null = null;
  for (const candidate of airports) {
    const distanceKm = haversineDistanceKm(item.lat, item.lon, candidate.latitude, candidate.longitude);
    if (!best || distanceKm < best.distanceKm) best = { airport: candidate, distanceKm };
  }
  return best;
}

describe("flight intelligence detector", () => {
  it("emits one probable holding after a sustained bounded orbit", () => {
    const detector = new FlightIntelligenceDetector(); const events = [] as string[];
    const tracks = [[50.10, 14.30, 0], [50.12, 14.30, 45], [50.12, 14.34, 90], [50.10, 14.34, 135], [50.08, 14.30, 180], [50.08, 14.26, 225], [50.10, 14.26, 270], [50.12, 14.30, 315], [50.10, 14.30, 0]];
    tracks.forEach(([lat, lon, track], index) => { const found = detector.observe(undefined, aircraft({ lat, lon, track, lastSeen: new Date(Date.parse("2026-09-17T12:00:00.000Z") + index * 30_000).toISOString(), altitude: 4000 })); events.push(...found.map((event) => event.type)); });
    expect(events.filter((event) => event === "HOLDING")).toHaveLength(1);
  });

  it("requires a sequence for go-around and rejects a lone climb", () => {
    const detector = new FlightIntelligenceDetector(); const at = (seconds: number, overrides: Partial<Aircraft>) => detector.observe(undefined, aircraft({ lastSeen: new Date(Date.parse("2026-09-17T12:00:00.000Z") + seconds * 1000).toISOString(), ...overrides }));
    expect(at(0, { lat: 50.25, lon: 14.26, altitude: 3500, verticalRate: -900 })).toEqual([]);
    expect(at(60, { lat: 50.14, lon: 14.26, altitude: 1500, verticalRate: -700 })).toEqual([]);
    expect(at(120, { lat: 50.105, lon: 14.26, altitude: 900, verticalRate: -300 })).toEqual([]);
    expect(at(180, { lat: 50.16, lon: 14.26, altitude: 1800, verticalRate: 1200 }).map((event) => event.type)).toContain("GO_AROUND");
    const lone = new FlightIntelligenceDetector(); expect(lone.observe(undefined, aircraft({ altitude: 9000, verticalRate: 1200 }))).toEqual([]);
  });

  it("debounces airspace entry, steady state, and exit", () => {
    const detector = new FlightIntelligenceDetector(); const base = Date.parse("2026-09-17T12:00:00.000Z"); const atc = { sectorId: "PRAHA-TMA" } as Aircraft["atc"];
    const observe = (seconds: number, sector: Aircraft["atc"]) => detector.observe(undefined, aircraft({ atc: sector, lastSeen: new Date(base + seconds * 1000).toISOString() }));
    expect(observe(0, atc)).toEqual([]); expect(observe(20, atc)).toEqual([]); expect(observe(50, atc).map((event) => event.type)).toContain("AIRSPACE_ENTRY"); expect(observe(70, atc)).toEqual([]); expect(observe(80, null)).toEqual([]); expect(observe(130, null).map((event) => event.type)).toContain("AIRSPACE_EXIT");
  });

  it.each([
    ["equal-distance preserves source order", [airport("FIRST", 50, 10), airport("SECOND", 50, -10)], aircraft({ lat: 50, lon: 0 })],
    ["antimeridian", [airport("EAST", 0, 179.8), airport("WEST", 0, -179.9)], aircraft({ lat: 0, lon: 179.95 })],
    ["north pole", [airport("NORTH", 89.8, 40), airport("FAR-NORTH", 88.5, 0)], aircraft({ lat: 89.9, lon: -140 })],
    ["south pole", [airport("SOUTH", -89.8, -40), airport("FAR-SOUTH", -88.5, 0)], aircraft({ lat: -89.9, lon: 140 })],
    ["identical coordinates preserve source order", [airport("FIRST", 12, 34), airport("SECOND", 12, 34)], aircraft({ lat: 12, lon: 34 })],
  ] as const)("selects the exact linear result for %s", (_name, airports, item) => {
    const indexed = new FlightIntelligenceDetector(airports).nearestAirport(item);
    const linear = nearestLinear(airports, item);
    expect(indexed?.airport.icaoCode).toBe(linear?.airport.icaoCode);
    expect(indexed?.distanceKm).toBeCloseTo(linear?.distanceKm ?? 0, 10);
  });

  it("handles an empty catalog and catalog replacement", () => {
    const item = aircraft({ lat: 50, lon: 14 });
    const detector = new FlightIntelligenceDetector([]);
    expect(detector.nearestAirport(item)).toBeNull();
    const replacement = [airport("REPLACED", 50, 14), airport("OTHER", 0, 0)];
    detector.setAirports(replacement);
    expect(detector.nearestAirport(item)).toMatchObject({ airport: replacement[0], distanceKm: 0 });
  });

  it("matches the original linear algorithm across catalog and aircraft sizes", () => {
    let seed = 0x41_42_43;
    const random = () => {
      seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
      return seed / 0x1_0000_0000;
    };
    for (const catalogSize of [0, 1, 7, 64, 257]) {
      const airports = Array.from({ length: catalogSize }, (_, index) => airport(
        `A${String(index).padStart(5, "0")}`,
        -89 + random() * 178,
        -180 + random() * 360,
      ));
      const detector = new FlightIntelligenceDetector(airports);
      for (const aircraftCount of [1, 3, 41]) {
        for (let index = 0; index < aircraftCount; index += 1) {
          const item = aircraft({ lat: -89 + random() * 178, lon: -180 + random() * 360 });
          const expected = nearestLinear(airports, item);
          const actual = detector.nearestAirport(item);
          expect(actual?.airport.icaoCode ?? null).toBe(expected?.airport.icaoCode ?? null);
          if (actual && expected) expect(actual.distanceKm).toBeCloseTo(expected.distanceKm, 10);
        }
      }
    }
  });
});
