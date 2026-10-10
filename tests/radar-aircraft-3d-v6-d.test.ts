import { describe, it, expect } from "vitest";
import type { AircraftView } from "@/lib/aircraft/types";
import { selectRadarAircraft3d, aircraft3dVertices, RADAR_AIRCRAFT_3D_LIMIT } from "@/lib/radar/aircraft-3d-v6-d";
const target=(icaoHex:string, extra:Partial<AircraftView>={}): AircraftView=>({
  icaoHex, lat:49.22, lon:17.71, altitude:12000, geomAltitude:12010, baroAltitude:12000,
  track:90, onGround:false, seenPosSeconds:3, distanceKm:30, ...extra,
} as AircraftView);
describe("V6-D 3D model selection and GPU budget",()=>{
  it("never manufactures positions, stale locations or altitudes",()=>{
    const all=[target("GOOD"),target("STALE",{seenPosSeconds:99}),target("NOGPS",{lat:null}),target("GROUND",{onGround:true}),target("NOALT",{altitude:null,geomAltitude:null,baroAltitude:null})];
    expect(selectRadarAircraft3d(all,null).map(x=>x.icaoHex)).toEqual(["GOOD"]);
  });
  it("caps candidate and mesh counts and preserves selected focus",()=>{
    const all=Array.from({length:50},(_,i)=>target(String(i).padStart(6,"0"),{distanceKm:i+1}));
    expect(selectRadarAircraft3d(all,null).length).toBe(RADAR_AIRCRAFT_3D_LIMIT);
    expect(selectRadarAircraft3d(all,"000049")[0]?.icaoHex).toBe("000049");
    expect(aircraft3dVertices(selectRadarAircraft3d(all,null)).length).toBe(RADAR_AIRCRAFT_3D_LIMIT*5*3*6);
  });
  it("marks fallback barometric altitude as approximate",()=>{
    expect(selectRadarAircraft3d([target("APPROX",{geomAltitude:null})],null)[0]?.approximateAltitude).toBe(true);
  });
});
