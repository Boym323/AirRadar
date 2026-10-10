import { describe, it, expect } from "vitest";
import { pickPresentationAircraft } from "@/lib/radar/presentation-v6-g";
import type { AircraftView } from "@/lib/aircraft/types";

function aircraft(hex: string, extras: Partial<AircraftView> = {}): AircraftView {
  return { icaoHex: hex, origin: "local", onGround: false, lat: 49, lon: 17, distanceKm: 12, seenPosSeconds: 4, ...extras } as AircraftView;
}
describe("V6-G presentation targeting", () => {
  it("uses only fresh LOCAL airborne positions", () => {
    const data = [aircraft("NETWORK", { origin: "adsbhub", distanceKm: 1 }),
      aircraft("STALE", { seenPosSeconds: 45, distanceKm: 2 }),
      aircraft("GROUND", { onGround: true, distanceKm: 1 }),
      aircraft("FRESH", { distanceKm: 5 })];
    expect(pickPresentationAircraft(data, null)?.icaoHex).toBe("FRESH");
  });
  it("alternates target deterministically without extra fetches", () => {
    const a = [aircraft("A", { distanceKm: 5 }), aircraft("B", { distanceKm: 6 })];
    expect(pickPresentationAircraft(a, null)?.icaoHex).toBe("A");
    expect(pickPresentationAircraft(a, "A")?.icaoHex).toBe("B");
    expect(pickPresentationAircraft([], "A")).toBeNull();
  });
  it("rejects invalid coordinates", () => {
    expect(pickPresentationAircraft([aircraft("X", { lat: null })], null)).toBeNull();
    expect(pickPresentationAircraft([aircraft("X", { lon: 999 })], null)).toBeNull();
  });
});
