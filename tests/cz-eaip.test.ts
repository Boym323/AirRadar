import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aviationCoordinateToDecimal, densifyArc } from "@/lib/atc/cz-geometry";
import { CzEaipParseError, parseCzEaipEnr21 } from "@/lib/atc/cz-eaip";
import type { AtcSector } from "@/lib/atc/types";
import { matchSector } from "@/lib/server/atc-sector-service";

const fixture = readFileSync(new URL("./fixtures/cz-eaip-enr21.html", import.meta.url), "utf8");
const publicationFixture = readFileSync(new URL("./fixtures/cz-gen02.html", import.meta.url), "utf8");

function parsedFixtureSector(): AtcSector {
  const source = parseCzEaipEnr21(fixture, { publicationHtml: publicationFixture }).document.sectors[0];
  return {
    id: source.id,
    name: source.name,
    atcCallsign: source.atcCallsign ?? null,
    service: source.service ?? null,
    polygons: source.polygons as AtcSector["polygons"],
    lowerAltitudeFt: 1000,
    upperAltitudeFt: 24500,
    lowerAltitudeReference: "AGL",
    upperAltitudeReference: "FL",
    frequencies: [
      { frequencyMhz: source.primaryFrequencyMhz!, label: null, isPrimary: true },
      ...(source.alternateFrequencies ?? []).map((frequency) => ({ frequencyMhz: frequency.frequencyMhz, label: frequency.label ?? null, isPrimary: false })),
    ],
    validFrom: null,
    validTo: null,
    country: "CZ",
    source: "fixture",
    sourceReference: "fixture://cz-eaip",
    lastVerifiedAt: "2026-09-06T00:00:00.000Z",
  };
}

describe("Czech eAIP geometry utilities", () => {
  it("converts aviation DMS coordinates and validates hemispheres", () => {
    expect(aviationCoordinateToDecimal("495454.10N")).toBeCloseTo(49.9150278, 7);
    expect(aviationCoordinateToDecimal("0150731.76E")).toBeCloseTo(15.1254889, 7);
    expect(aviationCoordinateToDecimal("495454.10S")).toBeCloseTo(-49.9150278, 7);
    expect(aviationCoordinateToDecimal("0150731.76W")).toBeCloseTo(-15.1254889, 7);
    expect(() => aviationCoordinateToDecimal("916000N")).toThrow(/out of range/);
    expect(() => aviationCoordinateToDecimal("495460N")).toThrow(/out of range/);
  });

  it.each(["CWA", "CCA"] as const)("preserves %s arc endpoints and follows its direction", (direction) => {
    const points = densifyArc({ start: [0, 1], end: [1, 0], center: [0, 0], radiusNm: 60, direction });
    expect(points[0]).toEqual([0, 1]);
    expect(points.at(-1)).toEqual([1, 0]);
    expect(points.length).toBeGreaterThan(2);
    const middle = points[Math.floor(points.length / 2)];
    if (direction === "CWA") expect(middle[0]).toBeGreaterThan(0);
    else expect(middle[0]).toBeLessThan(0);
  });

  it("keeps an arc crossing the longitude transition on the generated ring", () => {
    const points = densifyArc({ start: [179.5, 0], end: [-179.5, 0], center: [179.5, 1], radiusNm: 70, direction: "CWA" });
    expect(points[0]).toEqual([179.5, 0]);
    expect(points.at(-1)).toEqual([-179.5, 0]);
    expect(points.every(([longitude, latitude]) => longitude >= -180 && longitude <= 180 && latitude >= -90 && latitude <= 90)).toBe(true);
  });
});

describe("Czech eAIP ENR 2.1 parser", () => {
  it("classifies rows, resolves lateral references, retains reserve frequencies and metadata", () => {
    const result = parseCzEaipEnr21(fixture, { publicationHtml: publicationFixture, lastVerifiedAt: "2026-09-06T00:00:00.000Z" });
    expect(result.effectiveDate).toBe("2026-09-03");
    expect(result.publication).toMatchObject({ aipAmendment: "10/26", airacAmendment: "7/26" });
    expect(result.counts).toMatchObject({ accOperationalDetected: 3, valid: 3, skipped: 0 });
    expect(result.document.source.name).toContain("AIP AMDT 10/26");
    expect(result.document.sectors.map((sector) => sector.id)).toEqual(["LKAAFIX", "LKAAFIXCWA", "LKAAFIXREF"]);
    expect(result.document.sectors[0]).toMatchObject({ atcCallsign: "PRAHA RADAR", service: "ACC", lowerAltitude: "1000 AGL", upperAltitude: "FL245", primaryFrequencyMhz: 128.23 });
    expect(result.document.sectors[0].alternateFrequencies).toEqual([{ frequencyMhz: 124.05, label: "Reserve" }]);
    expect(result.document.sectors[0].polygons[0].length).toBeGreaterThan(3);
    expect(result.document.sectors[2].polygons).toEqual(result.document.sectors[0].polygons);
  });

  it("rejects a publication record that disagrees with ENR 2.1", () => {
    expect(() => parseCzEaipEnr21(fixture, { publicationHtml: publicationFixture.replace("3 SEP 2026", "4 SEP 2026") })).toThrow(CzEaipParseError);
  });

  it("matches inside, outside, boundary and vertical fixture points", () => {
    const sector = parsedFixtureSector();
    expect(matchSector(sector, { longitude: 13.5, latitude: 50, altitudeFt: 5000 })?.sector.id).toBe("LKAAFIX");
    expect(matchSector(sector, { longitude: 15, latitude: 50, altitudeFt: 5000 })).toBeNull();
    expect(matchSector(sector, { longitude: 14.5, latitude: 50, altitudeFt: 5000 })?.confidence).toBe("boundary");
    expect(matchSector(sector, { longitude: 13.5, latitude: 50, altitudeFt: 500 })).toBeNull();
    expect(matchSector(sector, { longitude: 13.5, latitude: 50, altitudeFt: 25000 })).toBeNull();
  });
});
