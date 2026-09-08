import { describe, expect, it } from "vitest";
import { AtcSectorService, matchSector, summarizeRelevantAtcFrequencies } from "@/lib/server/atc-sector-service";
import type { AtcAssignment, AtcSector, SectorPolygon } from "@/lib/atc/types";
import type { AtcAssignedAircraft } from "@/lib/server/atc-sector-service";

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

function baseAssignment(sectorId: string, name: string): AtcAssignment {
  return {
    sectorId,
    name,
    service: "ACC",
    callsign: "PRAGUE RADAR",
    primaryFrequencyMhz: 127.35,
    alternateFrequenciesMhz: [],
    lowerAltitudeFt: null,
    upperAltitudeFt: null,
    country: "CZ",
    source: "test",
    sourceReference: "test://atc",
    validFrom: null,
    validTo: null,
    lastVerifiedAt: "2026-09-01T00:00:00.000Z",
    confidence: "inside",
    altitudeConfidence: "matched",
  };
}

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
    const tower: AtcSector = { ...sector, id: "CTR", name: "Test CTR", service: "TWR", lowerAltitudeFt: 0, upperAltitudeFt: 5000 };
    const service = new AtcSectorService({ name: "test", getSectors: async () => [acc, approach, tower] });
    const matches = await service.lookupAll({ latitude: 50.5, longitude: 14.5, altitudeFt: 8000, observedAt: new Date("2026-09-15T12:00:00Z") });
    expect(matches.map((match) => match.sector.id)).toEqual(["APP", "ACC"]);
    await expect(service.lookup({ latitude: 50.5, longitude: 14.5, altitudeFt: 8000, observedAt: new Date("2026-09-15T12:00:00Z") })).resolves.toMatchObject({ sector: { id: "APP" } });
    const lowAltitudeMatches = await service.lookupAll({ latitude: 50.5, longitude: 14.5, altitudeFt: 4000, observedAt: new Date("2026-09-15T12:00:00Z") });
    expect(lowAltitudeMatches.map((match) => match.sector.id)).toEqual(["CTR", "APP", "ACC"]);
    await expect(service.lookup({ latitude: 50.5, longitude: 14.5, altitudeFt: 4000, observedAt: new Date("2026-09-15T12:00:00Z") })).resolves.toMatchObject({ sector: { id: "CTR" } });
  });

  it("keeps altitude confidence unknown when an AGL limit cannot be compared to MSL", () => {
    const aglSector: AtcSector = { ...sector, lowerAltitudeReference: "AGL", upperAltitudeReference: "FL" };
    expect(matchSector(aglSector, { latitude: 50.5, longitude: 14.5, altitudeFt: 500 })).toMatchObject({ altitudeConfidence: "unknown" });
    expect(matchSector(aglSector, { latitude: 50.5, longitude: 14.5, altitudeFt: 12501 })).toBeNull();
  });

  it("aggregates frequencies from probable assignments and deduplicates per aircraft", () => {
    const assignment = (sectorId: string, name: string): AtcAssignment => ({
      sectorId,
      name,
      service: "APP",
      callsign: "PRAGUE RADAR",
      primaryFrequencyMhz: 118.1,
      alternateFrequenciesMhz: [118.1, 119.2],
      lowerAltitudeFt: 3000,
      upperAltitudeFt: 12500,
      lowerAltitudeReference: "AMSL",
      upperAltitudeReference: "FL",
      country: "CZ",
      source: "test",
      sourceReference: "test://atc",
      validFrom: null,
      validTo: null,
      lastVerifiedAt: "2026-09-01T00:00:00.000Z",
      confidence: "inside",
    });
    const assigned = (aircraftId: string, value: AtcAssignment, label = aircraftId): AtcAssignedAircraft => ({ aircraftId, label, assignment: value });
    const summaries = summarizeRelevantAtcFrequencies([
      assigned("A", assignment("A", "TMA I"), "UAE139"),
      assigned("B", assignment("B", "TMA II"), "RYR123"),
      assigned("A", assignment("C", "TMA III"), "UAE139"),
      assigned("C", { ...assignment("D", "TMA IV"), callsign: "ALTERNATE RADAR" }, "DLH456"),
    ]);
    expect(summaries).toHaveLength(4);
    expect(summaries.find((item) => item.callsign === "PRAGUE RADAR" && item.frequencyMhz === 118.1)).toMatchObject({
      frequencyMhz: 118.1,
      service: "APP",
      callsign: "PRAGUE RADAR",
      sector: "TMA I / TMA II",
      aircraftCount: 2,
      confidence: { level: "high", positionInside: 2, altitudeMatched: 2, altitudeUnknown: 0 },
      source: "test",
      aircraftLabels: ["RYR123", "UAE139"],
      additionalAircraftCount: 0,
    });
  });

  it("ranks by aircraft count, confidence, service specificity and stable frequency order", () => {
    const make = (id: string, frequencyMhz: number, service: string, confidence: AtcAssignment["confidence"] = "inside", altitudeConfidence: AtcAssignment["altitudeConfidence"] = "matched"): AtcAssignedAircraft => ({
      aircraftId: id,
      label: id,
      assignment: { ...baseAssignment(id, id), primaryFrequencyMhz: frequencyMhz, service, confidence, altitudeConfidence },
    });
    const result = summarizeRelevantAtcFrequencies([
      make("A", 127.35, "ACC"), make("B", 127.35, "ACC"),
      make("C", 119.65, "APP", "boundary"),
      make("D", 119.65, "APP", "inside", "unknown"),
      make("E", 118.1, "TWR"),
    ]);
    expect(result.map((item) => [item.frequencyMhz, item.aircraftCount])).toEqual([[127.35, 2], [119.65, 2], [118.1, 1]]);
    expect(result[1].confidence.level).toBe("medium");
  });

  it("keeps unknown altitude confidence visible but weaker", () => {
    const value: AtcAssignment = {
      ...({
        sectorId: "AGL", name: "Test CTR", service: "TWR", callsign: "TEST TOWER", primaryFrequencyMhz: 119.1,
        alternateFrequenciesMhz: [], lowerAltitudeFt: 0, upperAltitudeFt: 2500, lowerAltitudeReference: "AGL", upperAltitudeReference: "AGL",
        country: "CZ", source: "AIP ČR", sourceReference: "test://atc", validFrom: null, validTo: null,
        lastVerifiedAt: "2026-09-01T00:00:00.000Z", confidence: "inside" as const, altitudeConfidence: "unknown" as const,
      }),
    };
    expect(summarizeRelevantAtcFrequencies([{ aircraftId: "A", label: "TEST1", assignment: value }])).toMatchObject([
      { frequencyMhz: 119.1, confidence: { level: "low", altitudeMatched: 0, altitudeUnknown: 1 } },
    ]);
  });

  it("aggregates the resolver's single CTR, TMA or ACC assignment without inventing nested recommendations", () => {
    const make = (id: string, service: string, frequencyMhz: number): AtcAssignedAircraft => ({
      aircraftId: id,
      label: id,
      assignment: { ...baseAssignment(id, id), service, primaryFrequencyMhz: frequencyMhz },
    });
    const result = summarizeRelevantAtcFrequencies([
      make("CTR-A", "CTR", 118.3),
      make("TMA-A", "TMA", 119.65),
      make("ACC-A", "ACC", 127.35),
    ]);
    expect(result.map((item) => item.service).sort()).toEqual(["ACC", "CTR", "TMA"]);
    expect(result).toHaveLength(3);
  });

  it("returns an empty result without invalid placeholder frequencies", () => {
    expect(summarizeRelevantAtcFrequencies([])).toEqual([]);
    expect(summarizeRelevantAtcFrequencies([{ aircraftId: "A", label: "A", assignment: { ...({ primaryFrequencyMhz: 0 } as AtcAssignment), alternateFrequenciesMhz: [] } }])).toEqual([]);
  });

  it("excludes frequencies at or above 140 MHz from relevant ATC summaries", () => {
    const result = summarizeRelevantAtcFrequencies([{
      aircraftId: "A",
      label: "A",
      assignment: {
        ...baseAssignment("A", "Test sector"),
        primaryFrequencyMhz: 127.35,
        alternateFrequenciesMhz: [136.975, 137, 140, 335.6, 378.75],
      },
    }]);
    expect(result.map((item) => item.frequencyMhz)).toEqual([127.35, 136.975]);
  });
});
