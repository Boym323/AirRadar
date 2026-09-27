import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aircraftWebglColor, aircraftWebglIconAsset, aircraftWebglPointSize, aircraftWebglScreenHeading } from "@/lib/radar/aircraft-webgl-layer";
import { resolveAircraftVisualHeading } from "@/lib/aircraft/visual-heading";
import { aircraftIconRotationOffset } from "@/lib/aircraft/icon-orientation";
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

  it("uses fresh Beast true heading on both HTML and WebGL marker paths", () => {
    expect(webglSource).toContain("aircraftReportedTrueHeading(aircraft)");
    expect(appSource).toContain("aircraftReportedTrueHeading(aircraft)");
    expect(appSource).toContain("reportedTrueHeading ?? aircraft.track");
  });

  it("preserves confirmed-position interpolation in the GPU runtime", () => {
    expect(webglSource).toContain("confirmedInterpolationDurationMs(");
    expect(webglSource).toContain("correctionFor(");
    expect(webglSource).toContain("motionAt(");
    expect(webglSource).toContain("allowPrediction: false");
    expect(webglSource).toContain("MercatorCoordinate.fromLngLat");
    expect(webglSource).toContain("gl.drawArrays(gl.POINTS");
    expect(webglSource).toContain("getRenderedPosition(icaoHex");
    expect(webglSource).toContain("pickAircraftAtPoint(point:");
    expect(webglSource).toContain("spatialBuckets");
    expect(webglSource).toContain("gl_VertexID == u_hovered_index");
    expect(webglSource).not.toContain("for (const [hex, job] of this.jobs) {\n      const next = hex === icaoHex");
    expect(appSource).toContain("aircraftWebglRuntime.getRenderedPosition(aircraft.icaoHex)");
    expect(appSource).toContain('map.on("render", refreshWebglLabelGeometry)');
    expect(appSource).toContain("aircraftWebglLabelAircraftRef.current");
    expect(appSource).toContain("aircraftWebglRuntime.pickAircraftAtPoint(event.point, 13)");
    expect(appSource).not.toContain("aircraft-webgl-hit");
  });

  it("honors reduced motion on the bulk GPU path", () => {
    expect(appSource).toContain("prefersReducedMotion,");
    expect(webglSource).toContain("this.options.prefersReducedMotion?.()");
    expect(webglSource).toContain("previous.correctionDurationMs = 0");
  });

  it("uses the classified tar1090 silhouette for each bulk aircraft", () => {
    expect(aircraftWebglIconAsset(aircraft({ aircraftType: "A320", category: "A3" }))).toBe("/aircraft-icons-tar1090/A320.svg");
    expect(aircraftWebglIconAsset(aircraft({ aircraftType: "B738", aircraftDescription: "Boeing 737-800", category: "A3" }))).toBe("/aircraft-icons-tar1090/B738.svg");
    expect(aircraftWebglIconAsset(aircraft({ aircraftType: "R44", aircraftDescription: "Robinson R44", category: null }))).toBe("/aircraft-icons-tar1090/R44.svg");
    expect(webglSource).toContain("sampler2DArray u_icon_atlas");
    expect(webglSource).toContain("gl.texSubImage3D(");
    expect(webglSource).toContain("job.iconLayer");
  });

  it("keeps north-up tar1090 atlas images unflipped during WebGL upload", () => {
    expect(webglSource).toContain("vec2 uv = vec2(q.x + 0.5, 0.5 - q.y)");
    expect(webglSource).toContain("gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);");
    expect(webglSource).not.toContain("gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);");
  });

  it("uses the same semantic silhouette size profile as HTML markers", () => {
    expect(aircraftWebglPointSize(aircraft({ aircraftType: "C172", aircraftDescription: "Cessna 172" }))).toBe(18);
    expect(aircraftWebglPointSize(aircraft({ aircraftType: "A320" }))).toBe(20);
    expect(aircraftWebglPointSize(aircraft({ aircraftType: "A333" }))).toBe(22);
    expect(aircraftWebglPointSize(aircraft({ aircraftType: "A388" }))).toBe(24);
    expect(aircraftWebglPointSize(aircraft({ aircraftType: "GND", category: "C0" }))).toBe(14);
    expect(webglSource).toContain("aircraftIconVisualSize(aircraft)");
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

  it.each([[0, 0], [90, 30], [180, 270], [359, 12]] as const)("keeps WebGL and HTML screen heading parity for track=%s bearing=%s", (track, mapBearing) => {
    const asset = aircraftWebglIconAsset(aircraft());
    const offset = aircraftIconRotationOffset(asset);
    expect(aircraftWebglScreenHeading(track, mapBearing, offset)).toBe(
      resolveAircraftVisualHeading({ motionHeading: track, mapBearing, assetOffset: offset }),
    );
  });

  it("reuses the WebGL vertex buffer instead of allocating a typed array per render", () => {
    expect(webglSource).toContain("private vertexData = new Float32Array(0)");
    expect(webglSource).toContain("if (this.vertexData.length < requiredFloats) this.vertexData = new Float32Array(requiredFloats)");
    expect(webglSource).not.toContain("const data = new Float32Array(this.jobs.size * FLOATS_PER_VERTEX)");
  });
});
