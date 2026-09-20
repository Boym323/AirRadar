import { describe, expect, it } from "vitest";
import type { AtcSector } from "@/lib/atc/types";
import { prepareSectorTraffic } from "@/lib/server/sector-traffic-context";
import { detectSectorTransition } from "@/lib/server/sector-traffic-transitions";

const sector: AtcSector = {
  id: "LKAATB", name: "Test", atcCallsign: "TEST", polygons: [[[14, 50], [15, 50], [15, 51], [14, 51], [14, 50]]],
  lowerAltitudeFt: 0, upperAltitudeFt: 40000, frequencies: [], validFrom: null, validTo: null,
  country: "CZ", source: "test", sourceReference: "test", lastVerifiedAt: "2026-09-01T00:00:00Z",
};
const at = new Date("2026-09-20T12:00:00Z");
const position = (id: number, seconds: number, lon: number) => ({ id, flightId: 1, recordedAt: new Date(at.getTime() - (300 - seconds) * 1000), lat: 50.5, lon, altitude: 10000, groundSpeed: 200, verticalRate: 0 });

describe("ATC sector transition semantics", () => {
  it.each([
    [undefined, true, null], [undefined, false, null], [false, true, "entering"], [true, false, "leaving"],
    [true, true, null], [false, false, null],
  ] as const)("does not invent transitions for %s -> %s", (previous, current, expected) => {
    expect(detectSectorTransition(previous, current, 60_000)).toBe(expected);
  });

  it("does not claim a crossing after a tracking gap", () => {
    expect(detectSectorTransition(false, true, 90_001)).toBeNull();
  });

  it("preprocesses trajectories once and applies the same first-sight/gap policy", () => {
    const fixture = [position(1, 0, 14.5), position(2, 60, 15.5), position(3, 120, 14.5), position(4, 300, 15.5)];
    const prepared = prepareSectorTraffic([sector], fixture, at);
    expect(prepared.transitionsBySector.get(sector.id)).toEqual([
      { flightId: 1, at: at.getTime() - 240_000, kind: "leaving" },
      { flightId: 1, at: at.getTime() - 180_000, kind: "entering" },
    ]);
    expect(prepared.currentBySector.get(sector.id)).toEqual([]);
  });

  it("handles a large fixture in one preprocessing pass without quadratic lookup", () => {
    const positions = Array.from({ length: 5_000 }, (_, flightId) => [
      { ...position(flightId * 2, 180, 15.5), flightId },
      { ...position(flightId * 2 + 1, 240, 14.5), flightId },
    ]).flat();
    const prepared = prepareSectorTraffic([sector], positions, at);
    expect(prepared.transitionsBySector.get(sector.id)).toHaveLength(5_000);
    expect(prepared.currentBySector.get(sector.id)).toHaveLength(5_000);
  });
});
