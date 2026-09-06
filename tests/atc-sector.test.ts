import { describe, expect, it } from "vitest";
import { matchSector } from "@/lib/server/atc-sector-service";
import type { AtcSector } from "@/lib/atc/types";

const sector: AtcSector = {
  id: "LKAA-TMA",
  name: "Test TMA",
  atcCallsign: "PRAGUE APPROACH",
  polygons: [[
    [14, 50],
    [15, 50],
    [15, 51],
    [14, 51],
    [14, 50],
  ]],
  lowerAltitudeFt: 3000,
  upperAltitudeFt: 12500,
  frequencies: [{ frequencyMhz: 118.1, label: "APP", isPrimary: true }],
  validFrom: null,
  validTo: null,
  country: "CZ",
  source: "test",
};

describe("ATC sector matching", () => {
  it("matches position and altitude and keeps the sector provider-agnostic", () => {
    expect(matchSector(sector, { latitude: 50.5, longitude: 14.5, altitudeFt: 8000 })?.sector.id).toBe("LKAA-TMA");
    expect(matchSector(sector, { latitude: 50.5, longitude: 14.5, altitudeFt: 2000 })).toBeNull();
  });

  it("recognizes polygon boundaries", () => {
    expect(matchSector(sector, { latitude: 50, longitude: 14, altitudeFt: 8000 })?.confidence).toBe("boundary");
  });
});
