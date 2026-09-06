import { describe, expect, it } from "vitest";
import { AtcSectorService, matchSector } from "@/lib/server/atc-sector-service";
import type { AtcSector, SectorPolygon } from "@/lib/atc/types";

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
  sourceReference: "test://atc-sector",
  lastVerifiedAt: "2026-09-01T00:00:00.000Z",
};

describe("ATC sector matching", () => {
  it("matches position and altitude and keeps the sector provider-agnostic", () => {
    expect(matchSector(sector, { latitude: 50.5, longitude: 14.5, altitudeFt: 8000 })?.sector.id).toBe("LKAA-TMA");
    expect(matchSector(sector, { latitude: 50.5, longitude: 14.5, altitudeFt: 2000 })).toBeNull();
  });

  it("recognizes polygon boundaries", () => {
    expect(matchSector(sector, { latitude: 50, longitude: 14, altitudeFt: 8000 })?.confidence).toBe("boundary");
  });

  it("matches separated polygon parts of one multipolygon sector", () => {
    const secondPart: SectorPolygon = [[16, 50], [17, 50], [17, 51], [16, 51]];
    const multipolygon: AtcSector = { ...sector, polygons: [sector.polygons[0], secondPart] };
    expect(matchSector(multipolygon, { latitude: 50.5, longitude: 16.5, altitudeFt: 8000 })?.sector.id).toBe("LKAA-TMA");
    expect(matchSector(multipolygon, { latitude: 50.5, longitude: 15.5, altitudeFt: 8000 })).toBeNull();
  });

  it("rejects aircraft above or below the vertical limits", () => {
    expect(matchSector(sector, { latitude: 50.5, longitude: 14.5, altitudeFt: 12501 })).toBeNull();
    expect(matchSector(sector, { latitude: 50.5, longitude: 14.5, altitudeFt: 2999 })).toBeNull();
    expect(matchSector(sector, { latitude: 50.5, longitude: 14.5, altitudeFt: null })).not.toBeNull();
  });

  it("matches only during the sector validity interval", () => {
    const validSector = { ...sector, validFrom: "2026-09-01T00:00:00.000Z", validTo: "2026-09-30T23:59:59.999Z" };
    expect(matchSector(validSector, { latitude: 50.5, longitude: 14.5, altitudeFt: 8000, observedAt: new Date("2026-09-15T12:00:00Z") })).not.toBeNull();
    expect(matchSector(validSector, { latitude: 50.5, longitude: 14.5, altitudeFt: 8000, observedAt: new Date("2026-08-31T23:59:59Z") })).toBeNull();
    expect(matchSector(validSector, { latitude: 50.5, longitude: 14.5, altitudeFt: 8000, observedAt: new Date("2026-10-01T00:00:00Z") })).toBeNull();
  });

  it("returns all overlaps in deterministic service/vertical priority order", async () => {
    const acc: AtcSector = { ...sector, id: "ACC", name: "Area control", service: "ACC", atcCallsign: "ACC", lowerAltitudeFt: null, upperAltitudeFt: null };
    const approach: AtcSector = { ...sector, id: "APP", service: "APP" };
    const service = new AtcSectorService({ name: "test", getSectors: async () => [acc, approach] });
    const matches = await service.lookupAll({ latitude: 50.5, longitude: 14.5, altitudeFt: 8000, observedAt: new Date("2026-09-15T12:00:00Z") });
    expect(matches.map((match) => match.sector.id)).toEqual(["APP", "ACC"]);
    await expect(service.lookup({ latitude: 50.5, longitude: 14.5, altitudeFt: 8000, observedAt: new Date("2026-09-15T12:00:00Z") })).resolves.toMatchObject({ sector: { id: "APP" } });
  });
});
