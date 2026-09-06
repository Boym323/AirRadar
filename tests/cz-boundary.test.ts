import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { InMemoryStateBoundaryProvider, type StateBoundaryFeature } from "@/lib/atc/cz-boundary";
import type { BoundaryResolver, StateBoundaryReference } from "@/lib/atc/boundary-resolver";
import { parseCzEaipEnr21 } from "@/lib/atc/cz-eaip";
import { aviationCoordinateToDecimal } from "@/lib/atc/cz-geometry";

const boundaryFeature = (id: string, coordinates: [number, number][], classification: StateBoundaryFeature["classification"] = "state"): StateBoundaryFeature => ({ id, coordinates, classification });

describe("ČÚZK state-boundary graph", () => {
  it("snaps endpoints to a simple authoritative segment and removes duplicate vertices", () => {
    const provider = new InMemoryStateBoundaryProvider([
      boundaryFeature("simple", [[0, 0], [0.01, 0], [0.02, 0]]),
    ]);
    const result = provider.getBoundarySegment({ start: [0.002, 0.001], end: [0.018, -0.001] });
    expect(result.coordinates[0][0]).toBeCloseTo(0.002, 6);
    expect(result.coordinates.at(-1)?.[0]).toBeCloseTo(0.018, 6);
    expect(result.coordinates.every((coordinate, index) => index === 0 || coordinate[0] !== result.coordinates[index - 1][0] || coordinate[1] !== result.coordinates[index - 1][1])).toBe(true);
    expect(result.startSnapDistanceKm).toBeCloseTo(0.111, 2);
    expect(result.endSnapDistanceKm).toBeCloseTo(0.111, 2);
  });

  it("fails when an endpoint is outside the bounded snap tolerance", () => {
    const provider = new InMemoryStateBoundaryProvider([boundaryFeature("simple", [[0, 0], [0.01, 0]])]);
    expect(() => provider.getBoundarySegment({ start: [0, 1], end: [0.5, 0], maxSnapDistanceKm: 50 })).toThrow(/maximum 50 km/);
  });

  it("rejects a several-kilometre nearest snap under the production policy", () => {
    const provider = new InMemoryStateBoundaryProvider([boundaryFeature("simple", [[0, 0], [0.02, 0]])]);
    expect(() => provider.getBoundarySegment({ start: [0.01, 0.005], end: [0.015, 0] })).toThrow(/maximum 0.5 km/);
  });

  it("rejects the audited Germany–Poland AIP endpoint from Czech geometry", () => {
    const provider = new InMemoryStateBoundaryProvider([
      boundaryFeature("35485:0", [[14.968341754358262, 50.99007376365752], [14.969, 50.990]]),
    ]);
    expect(() => provider.getBoundarySegment({
      start: [14.916945, 50.990677],
      end: [14.969, 50.990],
    })).toThrow(/3\.598 km.*maximum 0\.5 km/);
  });

  it("joins multiple features through a tripoint", () => {
    const provider = new InMemoryStateBoundaryProvider([
      boundaryFeature("state-a", [[0, 0], [0.01, 0]]),
      boundaryFeature("state-b", [[0.01, 0], [0.02, 0]]),
      boundaryFeature("tripoint", [[0.02, 0], [0.03, 0]], "tripoint"),
    ]);
    const result = provider.getBoundarySegment({ start: [0.001, 0.0005], end: [0.029, -0.0005] });
    expect(result.coordinates[0][0]).toBeCloseTo(0.001, 6);
    expect(result.coordinates.at(-1)?.[0]).toBeCloseTo(0.029, 6);
    expect(result.featureIds).toEqual(["state-a", "state-b", "tripoint"]);
  });

  it("resolves the reverse direction on the same path", () => {
    const provider = new InMemoryStateBoundaryProvider([boundaryFeature("reverse", [[0, 0], [0.01, 0], [0.02, 0]])]);
    const result = provider.getBoundarySegment({ start: [0.018, 0.0005], end: [0.002, -0.0005] });
    expect(result.coordinates[0][0]).toBeCloseTo(0.018, 6);
    expect(result.coordinates.at(-1)?.[0]).toBeCloseTo(0.002, 6);
  });

  it("fails for ambiguous and disconnected authoritative paths instead of using a straight line", () => {
    const ambiguous = new InMemoryStateBoundaryProvider([
      boundaryFeature("diamond-upper", [[0, 0], [0.005, 0.005], [0.01, 0]]),
      boundaryFeature("diamond-lower", [[0, 0], [0.005, -0.005], [0.01, 0]]),
    ]);
    expect(() => ambiguous.getBoundarySegment({ start: [0, 0], end: [0.01, 0] })).toThrow(/equally short/);

    const disconnected = new InMemoryStateBoundaryProvider([
      boundaryFeature("left", [[0, 0], [0.01, 0]]),
      boundaryFeature("right", [[0.03, 0], [0.04, 0]]),
    ]);
    expect(() => disconnected.getBoundarySegment({ start: [0.002, 0.001], end: [0.038, -0.001] })).toThrow(/No connected/);
  });

  it("converts the audited AIP endpoint from DMS independently", () => {
    expect(aviationCoordinateToDecimal("505926.4372N")).toBeCloseTo(50.990677, 10);
    expect(aviationCoordinateToDecimal("0145501.0020E")).toBeCloseTo(14.916945, 10);
  });
});

describe("Czech AIP state-boundary integration", () => {
  const fixture = readFileSync(new URL("./fixtures/cz-eaip-state-boundaries.html", import.meta.url), "utf8");
  const resolver: BoundaryResolver = {
    getBoundarySegment(reference, input) {
      return {
        coordinates: [input.start, [9.5, 49.5], input.end],
        startSnapDistanceKm: 0,
        endSnapDistanceKm: 0,
        pathLengthKm: 10,
        vertexCount: 3,
        maxSegmentLengthKm: 10,
        featureIds: ["fixture-state", "fixture-tripoint"], provider: reference.kind === "foreign-border" ? "BKG VG25" : "ČÚZK Data50",
      };
    },
  };

  it("resolves all six border PART constructions, inherits only unanimous aggregate limits, and keeps aggregates skipped", () => {
    const result = parseCzEaipEnr21(fixture, { boundaryResolver: resolver, lastVerifiedAt: "2026-09-06T00:00:00.000Z" });
    expect(result.counts).toMatchObject({ accOperationalDetected: 9, valid: 6, skipped: 3 });
    expect(result.diagnostics.filter((diagnostic) => diagnostic.status === "skipped").map((diagnostic) => diagnostic.name)).toEqual(["SECTOR MT", "SECTOR NL", "SECTOR N"]);
    const names = result.document.sectors.map((sector) => sector.name);
    expect(names).toEqual([
      "SECTOR MT PART 1",
      "SECTOR MT PART 2",
      "SECTOR NL PART 1",
      "SECTOR NL PART 2",
      "SECTOR N PART 1",
      "SECTOR N PART 2",
    ]);
    expect(result.document.sectors.find((sector) => sector.name === "SECTOR MT PART 1")?.lowerAltitude).toBe("FL95");
    expect(result.document.sectors.find((sector) => sector.name === "SECTOR N PART 1")?.lowerAltitude).toBe("FL305");
    expect(result.document.sectors.every((sector) => sector.polygons.every((polygon) => polygon[0].every((value, index) => value === polygon.at(-1)?.[index])))).toBe(true);
    expect(result.document.source.reference).toContain("geometry");
  });

  it("routes the audited Germany–Poland construct to BKG, preserving the tripoint path without a direct fallback", () => {
    const calls: StateBoundaryReference[] = [];
    const bkgPath: [number, number][] = [[14.916945, 50.990677], [14.88, 50.95], [14.823361138888889, 50.87057102777778]];
    const resolver: BoundaryResolver = {
      getBoundarySegment(reference, input) {
        calls.push(reference);
        expect(reference).toEqual({ kind: "foreign-border", countryA: "DE", countryB: "PL" });
        expect(input.start).toEqual([14.916945, 50.990677]);
        expect(input.end[0]).toBeCloseTo(14.823361138888889, 10);
        expect(input.end[1]).toBeCloseTo(50.87057102777778, 10);
        return { coordinates: bkgPath, startSnapDistanceKm: 0.01, endSnapDistanceKm: 0.01, pathLengthKm: 15, vertexCount: 3, maxSegmentLengthKm: 8, featureIds: ["bkg-de-pl"], provider: "BKG VG25" };
      },
    };
    const html = `<table><tr><td><p><strong><span class="SD">SECTOR TEST</span><span class="sdParams">TAIRSPACE;TXT_NAME;1</span> <span class="SD">LKAA-T</span><span class="sdParams">TAIRSPACE;CODE_ID;1</span></strong></p><p><span class="SD">505926.4372N</span><span class="sdParams">TAIRSPACE_VERTEX;GEO_LAT;1</span> <span class="SD">0145501.0020E</span><span class="sdParams">TAIRSPACE_VERTEX;GEO_LONG;1</span></p><p>state boundary <span class="SD">Germany - Poland</span><span class="sdParams">TGEO_BORDER;TXT_NAME;1</span></p><p><span class="SD">505214.0557N</span><span class="sdParams">TAIRSPACE_VERTEX;GEO_LAT;2</span> <span class="SD">0144924.1001E</span><span class="sdParams">TAIRSPACE_VERTEX;GEO_LONG;2</span></p><p><span class="SD">505800N</span><span class="sdParams">TAIRSPACE_VERTEX;GEO_LAT;3</span> <span class="SD">0145000E</span><span class="sdParams">TAIRSPACE_VERTEX;GEO_LONG;3</span></p><p><span class="SD">SFC</span><span class="sdParams">TAIRSPACE_VOLUME;UOM_DIST_VER_LOWER;1</span><span class="SD">FL</span><span class="sdParams">TAIRSPACE_VOLUME;UOM_DIST_VER_UPPER;1</span><span class="SD">125</span><span class="sdParams">TAIRSPACE_VOLUME;VAL_DIST_VER_UPPER;1</span></p></td></tr></table>`;
    const completeHtml = html.replace("UOM_DIST_VER_LOWER", "VAL_DIST_VER_LOWER").replace("</td></tr>", "</td><td><span class=\"SD\">PRAHA ACC</span><span class=\"sdParams\">TUNIT;TXT_NAME;1</span></td><td><span class=\"SD\">PRAHA RADAR</span><span class=\"sdParams\">TCALLSIGN_DETAIL;TXT_CALL_SIGN;1</span></td><td><span class=\"SD\">119.375</span><span class=\"sdParams\">TFREQUENCY;VAL_FREQ_TRANS;1</span></td></tr>");
    const result = parseCzEaipEnr21(`<html><head><meta name="EM.effectiveDateStart" content="2026-09-06" /></head><body>${completeHtml.replace("<table>", "<table><thead><tr><th>Lateral limits</th></tr></thead><tbody>").replace("</table>", "</tbody></table>")}</body></html>`, { boundaryResolver: resolver });
    expect(calls).toHaveLength(1);
    expect(result.diagnostics[0].boundaryResolutions?.[0]).toMatchObject({ provider: "BKG VG25", startSnapDistanceKm: 0.01, endSnapDistanceKm: 0.01 });
    expect(result.document.sectors[0].polygons[0]).toContainEqual([14.88, 50.95]);
  });
});
