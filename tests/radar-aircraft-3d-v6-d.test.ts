import { describe, it, expect, vi } from "vitest";
import { airframeFaceCount, resolveAirframeSpec, airframeModelFaces } from "@/lib/radar/aircraft-3d-models-v6";
import type { AircraftView } from "@/lib/aircraft/types";
import { selectRadarAircraft3d, aircraft3dVertices, RADAR_AIRCRAFT_3D_LIMIT, createRadarAircraft3dRuntime } from "@/lib/radar/aircraft-3d-v6-d";
const target=(icaoHex:string, extra:Partial<AircraftView>={}): AircraftView=>({
  icaoHex, lat:49.22, lon:17.71, altitude:12000, geomAltitude:12010, baroAltitude:12000,
  track:90, onGround:false, seenPosSeconds:3, distanceKm:30, ...extra,
} as AircraftView);
describe("V6-D 3D model selection and GPU budget",()=>{
  it("keeps the radar operational when optional WebGL2 shader creation fails", () => {
    const runtime = createRadarAircraft3dRuntime();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const map = { triggerRepaint: vi.fn() };
    const gl = {
      VERTEX_SHADER: 35633,
      ARRAY_BUFFER: 34962,
      createShader: () => null,
      bindVertexArray: vi.fn(),
      bindBuffer: vi.fn(),
    };
    try {
      expect(() => runtime.layer.onAdd?.(map as never, gl as never)).not.toThrow();
      expect(warn).toHaveBeenCalledOnce();
      expect(() => runtime.layer.onRemove?.(map as never, gl as never)).not.toThrow();
    } finally {
      warn.mockRestore();
    }
  });

  it("never manufactures positions, stale locations or altitudes",()=>{
    const all=[target("GOOD"),target("STALE",{seenPosSeconds:99}),target("NOGPS",{lat:null}),target("GROUND",{onGround:true}),target("NOALT",{altitude:null,geomAltitude:null,baroAltitude:null})];
    expect(selectRadarAircraft3d(all,null).map(x=>x.icaoHex)).toEqual(["GOOD"]);
  });
  it("caps candidate and mesh counts and preserves selected focus",()=>{
    const all=Array.from({length:50},(_,i)=>target(String(i).padStart(6,"0"),{distanceKm:i+1}));
    expect(selectRadarAircraft3d(all,null).length).toBe(RADAR_AIRCRAFT_3D_LIMIT);
    expect(selectRadarAircraft3d(all,"000049")[0]?.icaoHex).toBe("000049");
    expect(aircraft3dVertices(selectRadarAircraft3d(all,null)).length).toBe(RADAR_AIRCRAFT_3D_LIMIT*airframeFaceCount("")*3*6);
  });
  it("rejects impossible geographic and altitude evidence", () => {
    const invalid = [
      target("LAT", { lat: 91 }),
      target("LON", { lon: -181 }),
      target("ALT", { geomAltitude: 70000 }),
      target("NAN", { geomAltitude: Number.NaN, altitude: null, baroAltitude: null }),
      target("OLD", { seenPosSeconds: 31 }),
      target("NEG", { seenPosSeconds: -1 }),
    ];
    expect(selectRadarAircraft3d(invalid, null)).toEqual([]);
  });
  it("honors a strict zero budget and geometric-altitude conversion", () => {
    const row = target("VALID", { geomAltitude: 10000, altitude: 9000 });
    expect(selectRadarAircraft3d([row], null, 0)).toEqual([]);
    const selected = selectRadarAircraft3d([row], null);
    expect(selected[0]?.altitudeM).toBeCloseTo(3048);
    expect(selected[0]?.approximateAltitude).toBe(false);
    expect(aircraft3dVertices(selected).every(Number.isFinite)).toBe(true);
  });
  it("marks fallback barometric altitude as approximate",()=>{
    expect(selectRadarAircraft3d([target("APPROX",{geomAltitude:null})],null)[0]?.approximateAltitude).toBe(true);
  });

  it("uses physically differentiated airframe categories without external assets", () => {
    const narrow = resolveAirframeSpec("A320");
    const wide = resolveAirframeSpec("B77W");
    const quad = resolveAirframeSpec("A388");
    const prop = resolveAirframeSpec("C172");
    const rotor = resolveAirframeSpec("H145");
    expect(narrow.group).toBe("single-aisle");
    expect(wide.span).toBeGreaterThan(narrow.span);
    expect(quad.engines).toBe(4);
    expect(prop.highWing).toBe(true);
    expect(rotor.group).toBe("helicopter");
    expect(airframeFaceCount("A388")).toBeGreaterThan(airframeFaceCount("A320"));
    expect(airframeFaceCount("H145")).toBeLessThan(airframeFaceCount("A320"));
  });
  it("bounds meshes and gracefully falls back for unknown type codes", () => {
    expect(airframeModelFaces("UNKNOWN")).toBe(airframeModelFaces("NOT-AN-ICAO-TYPE"));
    const rows = [target("A32001", { aircraftType: "A320" }), target("B77W01", { aircraftType: "B77W" })];
    const model = aircraft3dVertices(selectRadarAircraft3d(rows, null));
    expect(model.length).toBe((airframeFaceCount("A320") + airframeFaceCount("B77W")) * 3 * 6);
    expect(model.every(Number.isFinite)).toBe(true);
    expect(airframeFaceCount("A320")).toBeLessThan(300);
  });
});
