import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aircraftWebglColor } from "@/lib/radar/aircraft-webgl-layer";
import type { AircraftView } from "@/lib/aircraft/types";

const appSource = readFileSync(new URL("../components/airradar-app.tsx", import.meta.url), "utf8");
const webglSource = readFileSync(new URL("../lib/radar/aircraft-webgl-layer.ts", import.meta.url), "utf8");

function aircraft(overrides: Partial<AircraftView> = {}): AircraftView {
  return {
    icaoHex: "ABC123",
    callsign: "TEST123",
    registration: "OK-TST",
    aircraftType: "A320",
    aircraftDescription: "Airbus A320",
    lat: 49.2,
    lon: 17.7,
    altitude: 32000,
    baroAltitude: 32000,
    geomAltitude: null,
    groundSpeed: 430,
    track: 90,
    verticalRate: 0,
    baroRate: null,
    geomRate: null,
    squawk: "2000",
    category: "A3",
    emergency: null,
    rssi: -14,
    messages: 10,
    seenSeconds: 0,
    seenPosSeconds: 0,
    lastSeen: new Date().toISOString(),
    source: "ADS-B",
    origin: "local",
    provenance: {
      seenLocal: true,
      seenNetwork: false,
      lastLocalSeen: new Date().toISOString(),
      lastNetworkSeen: null,
      positionOrigin: "local",
      positionSource: "ADS-B",
    },
    sourceType: "adsb_icao",
    onGround: false,
    distanceKm: 10,
    bearing: 90,
    enrichment: undefined,
    ...overrides,
  } as AircraftView;
}

describe("WebGL aircraft layer", () => {
  it("keeps ordinary aircraft on the bulk GPU path and special aircraft on HTML markers", () => {
    expect(appSource).toContain("createAircraftWebglRuntime");
    expect(appSource).toContain("aircraftWebglRuntime?.upsert");
    expect(appSource).toContain('aircraft.icaoHex === selectedHex');
    expect(appSource).toContain("isLiveAircraftWatchlisted(aircraft)");
    expect(appSource).toContain("Boolean(aircraft.emergency)");
    expect(appSource).toContain("liveSpecialAircraft");
    expect(appSource).toContain("liveBulkAircraft");
  });

  it("preserves confirmed-position interpolation in the GPU runtime", () => {
    expect(webglSource).toContain("confirmedInterpolationDurationMs(");
    expect(webglSource).toContain("correctionFor(");
    expect(webglSource).toContain("motionAt(");
    expect(webglSource).toContain("allowPrediction: false");
    expect(webglSource).toContain("MercatorCoordinate.fromLngLat");
    expect(webglSource).toContain("gl.drawArrays(gl.POINTS");
    expect(webglSource).toContain("getRenderedPosition(icaoHex");
    expect(appSource).toContain("aircraftWebglRuntime?.getRenderedPosition(aircraft.icaoHex)");
  });

  it("honors reduced motion on the bulk GPU path", () => {
    expect(appSource).toContain("prefersReducedMotion,");
    expect(webglSource).toContain("this.options.prefersReducedMotion?.()");
    expect(webglSource).toContain("previous.correctionDurationMs = 0");
  });

  it("keeps source-aware colors for bulk aircraft", () => {
    expect(aircraftWebglColor(aircraft(), "default")[3]).toBeGreaterThan(0.9);
    expect(aircraftWebglColor(aircraft({
      provenance: {
        seenLocal: false,
        seenNetwork: true,
        lastLocalSeen: null,
        lastNetworkSeen: new Date().toISOString(),
        positionOrigin: "adsblol",
        positionSource: "ADS-B",
      },
    }), "default")[3]).toBeLessThan(0.9);
  });
});
