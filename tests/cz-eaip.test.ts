import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aviationCoordinateToDecimal, densifyArc } from "@/lib/atc/cz-geometry";
import { CzEaipParseError, mergeCzAd2AtcResults, parseCzEaipAd2AtcAirspace, parseCzEaipEnr21 } from "@/lib/atc/cz-eaip";
import type { BoundaryResolver } from "@/lib/atc/boundary-resolver";
import { evaluateCzEaipDiagnosticPolicy } from "@/lib/atc/cz-eaip-policy";
import type { AtcSector } from "@/lib/atc/types";
import { matchSector } from "@/lib/server/atc-sector-service";

const fixture = readFileSync(new URL("./fixtures/cz-eaip-enr21.html", import.meta.url), "utf8");
const publicationFixture = readFileSync(new URL("./fixtures/cz-gen02.html", import.meta.url), "utf8");
const ad2Fixture = readFileSync(new URL("./fixtures/cz-eaip-ad2-ctr.html", import.meta.url), "utf8");

function referenceFixture(rows: string): string {
  return `<html><head><meta name="EM.effectiveDateStart" content="2026-09-03" /></head><body><table><thead><tr><th>Lateral limits</th><th>Unit</th><th>Callsign</th><th>Frequency</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
}

function referenceRow(name: string, id: number, lateral: string | null, coordinates: boolean): string {
  const geometry = coordinates
    ? `<p><span class="SD">500000N</span><span class="sdParams">TAIRSPACE_VERTEX;GEO_LAT;${id}1</span> <span class="SD">0140000E</span><span class="sdParams">TAIRSPACE_VERTEX;GEO_LONG;${id}1</span></p><p><span class="SD">501000N</span><span class="sdParams">TAIRSPACE_VERTEX;GEO_LAT;${id}2</span> <span class="SD">0140000E</span><span class="sdParams">TAIRSPACE_VERTEX;GEO_LONG;${id}2</span></p><p><span class="SD">501000N</span><span class="sdParams">TAIRSPACE_VERTEX;GEO_LAT;${id}3</span> <span class="SD">0150000E</span><span class="sdParams">TAIRSPACE_VERTEX;GEO_LONG;${id}3</span></p>`
    : `<p>lateral limits same as:</p><p><strong><span class="SD">${lateral}</span><span class="sdParams">TAIRSPACE;TXT_NAME;${id}9</span></strong></p>`;
  return `<tr><td><p><strong><span class="SD">${name}</span><span class="sdParams">TAIRSPACE;TXT_NAME;${id}</span></strong></p>${geometry}<p><span class="SD">SFC</span><span class="sdParams">TAIRSPACE_VOLUME;VAL_DIST_VER_LOWER;${id}</span> <span class="SD">FL</span><span class="sdParams">TAIRSPACE_VOLUME;UOM_DIST_VER_UPPER;${id}</span> <span class="SD">125</span><span class="sdParams">TAIRSPACE_VOLUME;VAL_DIST_VER_UPPER;${id}</span></p></td><td><span class="SD">PRAHA APP</span><span class="sdParams">TUNIT;TXT_NAME;${id}</span></td><td><span class="SD">TEST APP</span><span class="sdParams">TCALLSIGN_DETAIL;TXT_CALL_SIGN;${id}</span></td><td><span class="SD">119.100</span><span class="sdParams">TFREQUENCY;VAL_FREQ_TRANS;${id}</span></td></tr>`;
}

function sourceLimitedRow(name: string, annotationParam: string, unit: string, callsign: string, geometry = "valid"): string {
  const geometryHtml = geometry === "valid"
    ? `<p><span class="SD">500000N</span><span class="sdParams">TAIRSPACE_VERTEX;GEO_LAT;1</span> <span class="SD">0140000E</span><span class="sdParams">TAIRSPACE_VERTEX;GEO_LONG;1</span></p><p><span class="SD">501000N</span><span class="sdParams">TAIRSPACE_VERTEX;GEO_LAT;2</span> <span class="SD">0140000E</span><span class="sdParams">TAIRSPACE_VERTEX;GEO_LONG;2</span></p><p><span class="SD">501000N</span><span class="sdParams">TAIRSPACE_VERTEX;GEO_LAT;3</span> <span class="SD">0150000E</span><span class="sdParams">TAIRSPACE_VERTEX;GEO_LONG;3</span></p>`
    : `<p><span class="SD">500000N</span><span class="sdParams">TAIRSPACE_VERTEX;GEO_LAT;1</span> <span class="SD">0140000E</span><span class="sdParams">TAIRSPACE_VERTEX;GEO_LONG;1</span></p><p><span class="SD">501000N</span><span class="sdParams">TAIRSPACE_VERTEX;GEO_LAT;2</span> <span class="SD">0150000E</span><span class="sdParams">TAIRSPACE_VERTEX;GEO_LONG;2</span></p>`;
  return `<tr><td><p><strong><span class="SD">${name}</span><span class="sdParams">${annotationParam}</span></strong></p>${geometryHtml}<p><span class="SD">SFC</span><span class="sdParams">TAIRSPACE_VOLUME;VAL_DIST_VER_LOWER;1</span> <span class="SD">FL</span><span class="sdParams">TAIRSPACE_VOLUME;UOM_DIST_VER_UPPER;1</span> <span class="SD">125</span><span class="sdParams">TAIRSPACE_VOLUME;VAL_DIST_VER_UPPER;1</span></p></td><td><span class="SD">${unit}</span><span class="sdParams">TUNIT;TXT_NAME;1</span></td><td><span class="SD">${callsign}</span><span class="sdParams">TCALLSIGN_DETAIL;TXT_CALL_SIGN;1</span></td><td><span class="SD">119.100</span><span class="sdParams">TFREQUENCY;VAL_FREQ_TRANS;1</span></td></tr>`;
}

const referenceAccRow = `<tr><td><p><strong><span class="SD">SECTOR TEST</span><span class="sdParams">TAIRSPACE;TXT_NAME;100</span> <span class="SD">LKAAFIX</span><span class="sdParams">TAIRSPACE;CODE_ID;100</span></strong></p><p><span class="SD">500000N</span><span class="sdParams">TAIRSPACE_VERTEX;GEO_LAT;1001</span> <span class="SD">0140000E</span><span class="sdParams">TAIRSPACE_VERTEX;GEO_LONG;1001</span></p><p><span class="SD">501000N</span><span class="sdParams">TAIRSPACE_VERTEX;GEO_LAT;1002</span> <span class="SD">0140000E</span><span class="sdParams">TAIRSPACE_VERTEX;GEO_LONG;1002</span></p><p><span class="SD">501000N</span><span class="sdParams">TAIRSPACE_VERTEX;GEO_LAT;1003</span> <span class="SD">0150000E</span><span class="sdParams">TAIRSPACE_VERTEX;GEO_LONG;1003</span></p><p><span class="SD">SFC</span><span class="sdParams">TAIRSPACE_VOLUME;VAL_DIST_VER_LOWER;100</span> <span class="SD">FL</span><span class="sdParams">TAIRSPACE_VOLUME;UOM_DIST_VER_UPPER;100</span> <span class="SD">125</span><span class="sdParams">TAIRSPACE_VOLUME;VAL_DIST_VER_UPPER;100</span></p></td><td><span class="SD">PRAHA ACC</span><span class="sdParams">TUNIT;TXT_NAME;100</span></td><td><span class="SD">PRAHA RADAR</span><span class="sdParams">TCALLSIGN_DETAIL;TXT_CALL_SIGN;100</span></td><td><span class="SD">128.230</span><span class="sdParams">TFREQUENCY;VAL_FREQ_TRANS;100</span></td></tr>`;

const firRow = `<tr><td><p><strong><span class="SD">FIR PRAHA</span><span class="sdParams">TAIRSPACE;TXT_NAME;2987</span></strong></p><p><span class="SD">484617.8329N</span><span class="sdParams">TAIRSPACE_VERTEX;GEO_LAT;1</span> <span class="SD">0135022.4354E</span><span class="sdParams">TAIRSPACE_VERTEX;GEO_LONG;1</span></p><p><span class="SD">state boundary with Germany</span><span class="sdParams">TGEO_BORDER;ANNOTATION:1;1</span></p><p><span class="SD">505214.0557N</span><span class="sdParams">TAIRSPACE_VERTEX;GEO_LAT;2</span> <span class="SD">0144924.1001E</span><span class="sdParams">TAIRSPACE_VERTEX;GEO_LONG;2</span></p><p><span class="SD">state boundary with Poland</span><span class="sdParams">TGEO_BORDER;ANNOTATION:1;2</span></p><p><span class="SD">493101.7340N</span><span class="sdParams">TAIRSPACE_VERTEX;GEO_LAT;3</span> <span class="SD">0185103.2694E</span><span class="sdParams">TAIRSPACE_VERTEX;GEO_LONG;3</span></p><p><span class="SD">state boundary with Slovakia</span><span class="sdParams">TGEO_BORDER;ANNOTATION:1;3</span></p><p><span class="SD">483659.5406N</span><span class="sdParams">TAIRSPACE_VERTEX;GEO_LAT;4</span> <span class="SD">0165624.6784E</span><span class="sdParams">TAIRSPACE_VERTEX;GEO_LONG;4</span></p><p><span class="SD">state boundary with Austria</span><span class="sdParams">TGEO_BORDER;ANNOTATION:1;4</span></p><p><span class="SD">484617.8329N</span><span class="sdParams">TAIRSPACE_VERTEX;GEO_LAT;5</span> <span class="SD">0135022.4354E</span><span class="sdParams">TAIRSPACE_VERTEX;GEO_LONG;5</span></p><p><span class="SD">FL</span><span class="sdParams">TAIRSPACE_VOLUME;UOM_DIST_VER_UPPER;3032</span> <span class="SD">660</span><span class="sdParams">TAIRSPACE_VOLUME;VAL_DIST_VER_UPPER;3032</span> / <span class="SD">GND</span><span class="sdParams">TAIRSPACE_VOLUME;VAL_DIST_VER_LOWER;3032</span></p></td><td>Units providing services are set at particular areas</td><td></td><td></td></tr>`;

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
    expect(aviationCoordinateToDecimal("012 43 29,00 E")).toBeCloseTo(12.7247222, 7);
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
  it("imports FIR PRAHA from its authoritative state-boundary walk and keeps UIR NIL empty", () => {
    const resolutions: Array<{ neighbour: string; start: number[]; end: number[] }> = [];
    const boundaryResolver: BoundaryResolver = {
      getBoundarySegment(reference, input) {
        if (reference.kind !== "czech-border") throw new Error("unexpected boundary kind");
        resolutions.push({ neighbour: reference.neighbour, start: input.start, end: input.end });
        return {
          coordinates: [input.start, input.end],
          startSnapDistanceKm: 0,
          endSnapDistanceKm: 0,
          pathLengthKm: 1,
          vertexCount: 2,
          maxSegmentLengthKm: 1,
          featureIds: [`cz-${reference.neighbour}`],
          provider: "ČÚZK Data50",
        };
      },
    };
    const result = parseCzEaipEnr21(referenceFixture(`${firRow}<tr><td colspan="5">UIR: NIL</td></tr>`), { boundaryResolver });
    expect(result.document.sectors).toHaveLength(1);
    expect(result.document.sectors[0]).toMatchObject({
      id: "LKAA-AIP-2987",
      name: "FIR PRAHA",
      country: "CZ",
      airspaceType: "FIR",
      airspaceClass: null,
      lowerAltitude: "SFC",
      upperAltitude: "FL660",
      primaryFrequencyMhz: null,
    });
    expect(result.document.sectors[0].polygons[0].length).toBe(5);
    expect(resolutions.map(({ neighbour }) => neighbour)).toEqual(["DE", "PL", "SK", "AT"]);
    expect(result.document.sectors.some((sector) => /UIR/i.test(sector.name))).toBe(false);
    expect(result.diagnostics.some((diagnostic) => /UIR/i.test(diagnostic.name))).toBe(false);
  });

  it("classifies rows, resolves lateral references, retains reserve frequencies and metadata", () => {
    const result = parseCzEaipEnr21(fixture, { publicationHtml: publicationFixture, lastVerifiedAt: "2026-09-06T00:00:00.000Z" });
    expect(result.effectiveDate).toBe("2026-09-03");
    expect(result.publication).toMatchObject({ aipAmendment: "10/26", airacAmendment: "7/26" });
    expect(result.counts).toMatchObject({ accOperationalDetected: 3, valid: 4, skipped: 1 });
    expect(result.document.source.name).toContain("AIP AMDT 10/26");
    expect(result.document.sectors.map((sector) => sector.id)).toEqual(["LKAAFIX", "LKAAFIXCWA", "LKAAFIXREF", "LKAA-AIP-9005"]);
    expect(result.document.sectors[0]).toMatchObject({ atcCallsign: "PRAHA RADAR", service: "ACC", lowerAltitude: "1000 AGL", upperAltitude: "FL245", primaryFrequencyMhz: 128.23 });
    expect(result.diagnostics.find((diagnostic) => diagnostic.name === "SECTOR FIX")?.classification).toBe("persistable");
    expect(result.document.sectors[0].alternateFrequencies).toEqual([{ frequencyMhz: 124.05, label: "Reserve" }]);
    expect(result.document.sectors[0].polygons[0].length).toBeGreaterThan(3);
    expect(result.document.sectors[2].polygons).toEqual(result.document.sectors[0].polygons);
    expect(result.document.sectors[3]).toMatchObject({ name: "TMA SAMPLE", service: "APP", primaryFrequencyMhz: 119.1, upperAltitude: "FL125" });
  });

  it("rejects a publication record that disagrees with ENR 2.1", () => {
    expect(() => parseCzEaipEnr21(fixture, { publicationHtml: publicationFixture.replace("3 SEP 2026", "4 SEP 2026") })).toThrow(CzEaipParseError);
  });

  it("imports a CTR from authoritative AD 2.17/2.18 pages without inventing transmitters", () => {
    const parsed = parseCzEaipAd2AtcAirspace(ad2Fixture, { lastVerifiedAt: "2026-09-06T00:00:00.000Z" });
    expect(parsed.diagnostic).toMatchObject({ name: "CTR Test", objectType: "CTR", status: "accepted" });
    expect(parsed.document.transmitters).toEqual([]);
    expect(parsed.document.sectors[0]).toMatchObject({
      id: "CZ-LKPR-CTR-TEST",
      service: "TWR",
      atcCallsign: "TEST TOWER",
      lowerAltitude: "SFC",
      upperAltitude: "FL125",
      primaryFrequencyMhz: 118.1,
      alternateFrequencies: [{ frequencyMhz: 118.2, label: "Supplementary" }],
      sourceReference: expect.stringContaining("AD-2.18"),
      validFrom: "2026-09-03",
    });
    const merged = mergeCzAd2AtcResults(parseCzEaipEnr21(fixture, { publicationHtml: publicationFixture }), [parsed]);
    expect(merged.counts.classification.CTR).toBe(1);
    expect(merged.document.sectors.some((sector) => sector.id === "CZ-LKPR-CTR-TEST")).toBe(true);
  });

  it("matches inside, outside, boundary and vertical fixture points", () => {
    const sector = parsedFixtureSector();
    expect(matchSector(sector, { longitude: 13.5, latitude: 50, altitudeFt: 5000 })?.sector.id).toBe("LKAAFIX");
    expect(matchSector(sector, { longitude: 15, latitude: 50, altitudeFt: 5000 })).toBeNull();
    expect(matchSector(sector, { longitude: 14.5, latitude: 50, altitudeFt: 5000 })?.confidence).toBe("boundary");
    expect(matchSector(sector, { longitude: 13.5, latitude: 50, altitudeFt: 500 })).toMatchObject({ altitudeConfidence: "unknown" });
    expect(matchSector(sector, { longitude: 13.5, latitude: 50, altitudeFt: 25000 })).toBeNull();
  });

  it("resolves an explicit lateral reference chain without guessing", () => {
    const html = referenceFixture([
      referenceAccRow,
      referenceRow("TMA A", 201, "TMA B", false),
      referenceRow("TMA B", 202, "TMA C", false),
      referenceRow("TMA C", 203, null, true),
    ].join(""));
    const result = parseCzEaipEnr21(html);
    expect(result.counts).toMatchObject({ valid: 4, skipped: 0 });
    const tmaA = result.document.sectors.find((sector) => sector.name === "TMA A");
    const tmaC = result.document.sectors.find((sector) => sector.name === "TMA C");
    expect(tmaA?.polygons).toEqual(tmaC?.polygons);
  });

  it("rejects a lateral reference cycle without recursive overflow", () => {
    const html = referenceFixture([
      referenceAccRow,
      referenceRow("TMA A", 301, "TMA B", false),
      referenceRow("TMA B", 302, "TMA A", false),
    ].join(""));
    const result = parseCzEaipEnr21(html);
    expect(result.counts).toMatchObject({ valid: 1, skipped: 2 });
    expect(result.diagnostics.filter((diagnostic) => diagnostic.status === "skipped").every((diagnostic) => diagnostic.reason?.includes("lateral geometry reference cycle"))).toBe(true);
  });

  it("classifies the three audited annotation-only rows as source-limited without creating IDs", () => {
    const html = referenceFixture([
      referenceAccRow,
      sourceLimitedRow("SECTOR ČECHY WEST", "TAIRSPACE;Annotation:122550.cze;3063", "PRAHA FIC", "PRAHA INFORMATION"),
      sourceLimitedRow("SECTOR ČECHY EAST", "TAIRSPACE;Annotation:122581.cze;3062", "PRAHA FIC", "PRAHA INFORMATION"),
      sourceLimitedRow("TMA ČESKÉ BUDĚJOVICE", "TAIRSPACE;Annotation:122677.cze;4274", "PRAHA ACC", "PRAHA RADAR"),
    ].join(""));
    const result = parseCzEaipEnr21(html, { lastVerifiedAt: "2026-09-06T00:00:00.000Z" });
    const limited = result.diagnostics.filter((diagnostic) => diagnostic.classification === "source_limitation");
    expect(limited.map((diagnostic) => diagnostic.name)).toEqual(["SECTOR ČECHY WEST", "SECTOR ČECHY EAST", "TMA ČESKÉ BUDĚJOVICE"]);
    expect(limited.every((diagnostic) => diagnostic.stableId === null)).toBe(true);
    expect(result.document.sectors.map((sector) => sector.name)).toEqual(["SECTOR TEST"]);
    expect(result.counts).toMatchObject({ valid: 1, skipped: 3, sourceLimitedRows: 3, blockingSupportedRows: 0 });
  });

  it("keeps an unexpected missing ID as a blocking parser diagnostic", () => {
    const result = parseCzEaipEnr21(referenceFixture([
      referenceAccRow,
      sourceLimitedRow("TMA UNEXPECTED", "TAIRSPACE;Annotation:unexpected", "PRAHA APP", "TEST APP"),
    ].join("")));
    const diagnostic = result.diagnostics.find((item) => item.name === "TMA UNEXPECTED");
    expect(diagnostic).toMatchObject({ classification: "parser_blocker", reason: "missing authoritative stable source identifier", stableId: null });
    expect(result.counts.blockingSupportedRows).toBe(1);
  });

  it("blocks malformed geometry before applying a source limitation", () => {
    const result = parseCzEaipEnr21(referenceFixture([
      referenceAccRow,
      sourceLimitedRow("TMA ČESKÉ BUDĚJOVICE", "TAIRSPACE;Annotation:122677.cze;4274", "PRAHA ACC", "PRAHA RADAR", "malformed"),
    ].join("")));
    expect(result.diagnostics.find((item) => item.name === "TMA ČESKÉ BUDĚJOVICE")).toMatchObject({ classification: "parser_blocker", reason: "missing explicit or resolvable lateral geometry" });
    expect(result.counts.sourceLimitedRows).toBe(0);
    expect(result.counts.blockingSupportedRows).toBe(1);
  });

  it("blocks ambiguous explicit geometry references", () => {
    const ambiguous = referenceRow("TMA AMBIGUOUS", 401, "TMA B", false).replace(
      `<span class="SD">TMA B</span><span class="sdParams">TAIRSPACE;TXT_NAME;4019</span>`,
      `<span class="SD">TMA B</span><span class="sdParams">TAIRSPACE;TXT_NAME;4019</span> <span class="SD">TMA C</span><span class="sdParams">TAIRSPACE;TXT_NAME;4018</span>`,
    );
    const result = parseCzEaipEnr21(referenceFixture([referenceAccRow, ambiguous].join("")));
    expect(result.diagnostics.find((item) => item.name === "TMA AMBIGUOUS")).toMatchObject({ classification: "parser_blocker", reason: expect.stringContaining("ambiguous") });
  });

  it("keeps source-limited policy deterministic and blocks historical identity regression", () => {
    const diagnostic = {
      name: "TMA ČESKÉ BUDĚJOVICE",
      stableId: null,
      objectType: "TMA" as const,
      status: "skipped" as const,
      classification: "source_limitation" as const,
      reason: "missing authoritative stable source identifier",
    };
    const emptyDatabase = evaluateCzEaipDiagnosticPolicy({ diagnostics: [diagnostic], databaseAvailable: true, existingSectors: [] });
    expect(emptyDatabase.blockingSupportedRows).toHaveLength(0);
    const historical = evaluateCzEaipDiagnosticPolicy({
      diagnostics: [diagnostic],
      databaseAvailable: true,
      existingSectors: [{ name: diagnostic.name, sourceReference: "https://aim.rlp.cz/eaip/html/eAIP/LK-ENR-2.1-en-GB.html" } as never],
    });
    expect(historical.historicalRegressions).toHaveLength(1);
    expect(historical.blockingSupportedRows).toHaveLength(1);
    const unknownHistory = evaluateCzEaipDiagnosticPolicy({ diagnostics: [diagnostic], databaseAvailable: false });
    expect(unknownHistory.historyUnknown).toHaveLength(1);
    expect(unknownHistory.blockingSupportedRows).toHaveLength(1);
  });

  it("keeps repeated dry-run parsing byte-for-byte equivalent with fixed provenance", () => {
    const html = referenceFixture([referenceAccRow, sourceLimitedRow("SECTOR ČECHY WEST", "TAIRSPACE;Annotation:122550.cze;3063", "PRAHA FIC", "PRAHA INFORMATION")].join(""));
    const options = { lastVerifiedAt: "2026-09-06T00:00:00.000Z" };
    expect(parseCzEaipEnr21(html, options)).toEqual(parseCzEaipEnr21(html, options));
  });

  it("propagates parser exceptions instead of producing a partial dataset", () => {
    expect(() => parseCzEaipEnr21(fixture, { publicationHtml: publicationFixture.replace("3 SEP 2026", "4 SEP 2026") })).toThrow(CzEaipParseError);
  });
});
