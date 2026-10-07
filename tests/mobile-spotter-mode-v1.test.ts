import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AircraftView } from "@/lib/aircraft/types";
import { filterSpotterAircraft, isLocalSpotterAircraft, sortSpotterAircraftByDistance } from "@/lib/spotter";

function aircraft(hex: string, distanceKm: number | null, origin: AircraftView["origin"] = "local", altitude = 5000, aircraftType = "A320"): AircraftView {
  return {
    icaoHex: hex,
    callsign: null,
    registration: null,
    aircraftType,
    aircraftDescription: null,
    lat: 50,
    lon: 14,
    altitude,
    baroAltitude: altitude,
    geomAltitude: null,
    groundSpeed: 200,
    track: 90,
    verticalRate: 0,
    baroRate: 0,
    geomRate: null,
    squawk: null,
    category: null,
    emergency: null,
    rssi: null,
    messages: 1,
    seenSeconds: 0,
    seenPosSeconds: 0,
    lastSeen: "2026-10-06T20:00:00Z",
    source: "ADS-B",
    origin,
    sourceType: null,
    onGround: false,
    distanceKm,
    bearing: 180,
  };
}

describe("Mobile Spotter Mode V1 local boundary", () => {
  it("fails closed to LOCAL evidence only", () => {
    const local = aircraft("AAAAAA", 5, "local");
    const network = aircraft("BBBBBB", 2, "adsblol");
    const provenanceLocal = { ...aircraft("CCCCCC", 3, "adsbhub"), provenance: {
      seenLocal: true,
      seenNetwork: true,
      lastLocalSeen: "2026-10-06T20:00:00Z",
      lastNetworkSeen: "2026-10-06T20:00:00Z",
      positionOrigin: "adsbhub" as const,
      positionSource: "ADS-B" as const,
    } };
    expect(isLocalSpotterAircraft(local)).toBe(true);
    expect(isLocalSpotterAircraft(network)).toBe(false);
    expect(isLocalSpotterAircraft(provenanceLocal)).toBe(true);
    expect(filterSpotterAircraft([network, provenanceLocal, local], {
      maxDistanceKm: null,
      maxAltitudeFt: null,
      discovery: "all",
      aircraftType: "",
    }).map((item) => item.icaoHex)).toEqual(["CCCCCC", "AAAAAA"]);
  });

  it("sorts by receiver distance ascending with unknown distance last", () => {
    expect(sortSpotterAircraftByDistance([
      aircraft("AAAAAA", null),
      aircraft("BBBBBB", 20),
      aircraft("CCCCCC", 5),
    ]).map((item) => item.icaoHex)).toEqual(["CCCCCC", "BBBBBB", "AAAAAA"]);
  });

  it("applies bounded distance, altitude, discovery and type filters", () => {
    const items = [
      aircraft("AAAAAA", 5, "local", 4000, "A320"),
      aircraft("BBBBBB", 25, "local", 9000, "B738"),
      aircraft("CCCCCC", 8, "local", 15000, "A320"),
    ];
    const labels = new Map([["AAAAAA", ["new"] as const], ["BBBBBB", ["rare"] as const]]);
    expect(filterSpotterAircraft(items, {
      maxDistanceKm: 10,
      maxAltitudeFt: 10000,
      discovery: "new",
      aircraftType: "A32",
    }, labels).map((item) => item.icaoHex)).toEqual(["AAAAAA"]);
  });
});

describe("Mobile Spotter Mode V1 runtime boundaries", () => {
  const source = readFileSync(new URL("../components/mobile-spotter-mode.tsx", import.meta.url), "utf8");
  const stream = readFileSync(new URL("../components/use-aircraft-stream.ts", import.meta.url), "utf8");

  it("reuses the existing LOCAL live stream and discovery summary", () => {
    expect(source).toContain('activeCoverage: "local"');
    expect(source).toContain('fetch("/api/logbook/summary"');
    expect(source).toContain("runtimeBudget.discoveryRefreshMs");
    expect(stream).toContain("/api/stream?coverage=");
  });

  it("uses canonical product actions, browser geolocation and no backend spotter path", () => {
    expect(source).toContain("/aircraft/");
    expect(source).toContain("/?aircraft=");
    expect(source).toContain('pathname: "/watchlist"');
    expect(source).toContain("navigator.geolocation.watchPosition");
    expect(source).toContain("navigator.geolocation.clearWatch");
    expect(source).not.toContain("/api/spotter");
    expect(source).toContain("SPOTTER_LOGBOOK_STORAGE_KEY");
    expect(source).toContain("window.localStorage.getItem");
    expect(source).toContain("window.localStorage.setItem");
    expect(source).not.toContain("new EventSource");
  });

  it("renders explicit stale/unavailable states", () => {
    expect(source).toContain('"stale"');
    expect(source).toContain('"unavailable"');
    expect(source).toContain("snapshot.sourceOnline");
  });
});
