import { describe, expect, it } from "vitest";
import { computeAtcContext, prepareAtcContextDataset } from "@/lib/atc-context/engine";
import { pointInPolygon } from "@/lib/atc-context/geometry";
import type { AtcContextDataset } from "@/lib/atc-context/types";
import type { AtcSector } from "@/lib/atc/types";

const sector = (overrides: Partial<AtcSector> = {}): AtcSector => ({
  id: "CZ-FIR", name: "FIR PRAHA", atcCallsign: "PRAGUE RADAR", service: "ACC", airspaceType: "FIR", airspaceClass: "C", remarks: null,
  polygons: [[[14, 49], [15, 49], [15, 50], [14, 50], [14, 49]]], lowerAltitudeFt: 0, upperAltitudeFt: null,
  lowerAltitudeReference: "SFC", upperAltitudeReference: "UNL", frequencies: [], validFrom: null, validTo: null, country: "CZ", source: "fixture", sourceReference: "fixture://atc", lastVerifiedAt: "2026-01-01T00:00:00.000Z", ...overrides,
});
const dataset = (sectors: AtcSector[]): AtcContextDataset => ({ sectors, routeDocuments: [] });
const input = (overrides: Record<string, unknown> = {}) => ({ lat: 49.5, lon: 14.5, altitude: 20000, baroAltitude: 20000, geomAltitude: 19800, altitudeSource: "baro" as const, track: 90, groundSpeed: 240, verticalRate: 0, timestamp: "2026-01-01T12:00:00.000Z", ...overrides });

describe("ATC Context Engine", () => {
  it("treats boundaries as inside and supports polygon holes", () => {
    expect(pointInPolygon([14, 49.5], [[[14, 49], [15, 49], [15, 50], [14, 50], [14, 49]]])).toBe("boundary");
    expect(pointInPolygon([14.5, 49.5], [[[14, 49], [15, 49], [15, 50], [14, 50], [14, 49]], [[14.25, 49.25], [14.75, 49.25], [14.75, 49.75], [14.25, 49.75], [14.25, 49.25]]])).toBeNull();
  });

  it("keeps all matching spaces and chooses the most specific display space", () => {
    const result = computeAtcContext(input(), dataset([sector(), sector({ id: "CZ-TMA", name: "TMA PRAHA", airspaceType: "TMA", lowerAltitudeFt: 3000, upperAltitudeFt: 25000, lowerAltitudeReference: "AMSL", upperAltitudeReference: "AMSL" })]));
    expect(result.currentAirspaces.map((value) => value.id)).toEqual(["CZ-TMA", "CZ-FIR"]);
    expect(result.primaryAirspace?.id).toBe("CZ-TMA");
  });

  it("does not show a TMA above its upper limit", () => {
    const result = computeAtcContext(input({ altitude: 36000, baroAltitude: 36000, geomAltitude: 36000 }), dataset([sector({ id: "CZ-TMA", name: "TMA", airspaceType: "TMA", lowerAltitudeFt: 3000, upperAltitudeFt: 12500, lowerAltitudeReference: "AMSL", upperAltitudeReference: "AMSL" })]));
    expect(result.currentAirspaces).toHaveLength(0);
  });

  it("marks AGL containment uncertain instead of excluding it", () => {
    const result = computeAtcContext(input(), dataset([sector({ lowerAltitudeFt: 1000, upperAltitudeFt: 5000, lowerAltitudeReference: "AGL", upperAltitudeReference: "AGL" })]));
    expect(result.currentAirspaces[0]?.verticalMatch).toBe("uncertain");
    expect(result.currentAirspaces[0]?.confidence).toBe("partial");
  });

  it("suppresses weak route matches and en-route matching on the ground", () => {
    const routeDocuments = [{ schemaVersion: 1 as const, source: { name: "fixture", reference: "fixture://ats", effectiveDate: "2026-01-01", lastVerifiedAt: "2026-01-01", aipAmendment: null, airacAmendment: null, countryCode: "CZ" }, routes: [{ designator: "L984", sourceId: "L984", points: [], discontinuities: [], segments: [{ id: "L984-1", sourceId: "L984-1", fromPointId: "A", toPointId: "B", fromName: "A", toName: "B", from: [14, 49] as [number, number], to: [15, 49] as [number, number], navigationSpecification: "RNAV", magTrackForwardDeg: null, magTrackReverseDeg: null, distanceNm: 37, geometricDistanceNm: 37, upperLimit: "UNL", lowerLimit: "SFC", lowerOverride: null, cruisingLevelForward: null, cruisingLevelReverse: null, availabilityClass: null, availabilityStatus: "UNKNOWN" as const, remarks: null }] }], counts: { routes: 1, points: 0, segments: 1, cdrSegments: 0, discontinuities: 0 } }];
    expect(computeAtcContext(input({ lat: 49, lon: 14.5 }), { sectors: [], routeDocuments }).atsRoute?.confidence).toBe("high");
    expect(computeAtcContext(input({ onGround: true }), { sectors: [], routeDocuments }).atsRoute).toBeNull();
  });

  it("prepares immutable indexes and uses reduced candidate sets", () => {
    const prepared = prepareAtcContextDataset({
      sectors: [sector(), sector({ id: "CZ-TMA", name: "TMA PRAHA", airspaceType: "TMA" })],
      routeDocuments: [],
    });
    expect(prepared.prepared).toBe(true);
    expect(prepared.airspaces.map((entry) => entry.sector.id)).toEqual(["CZ-TMA", "CZ-FIR"]);
    expect(() => (prepared.airspaces as unknown as AtcSector[]).push(sector())).toThrow();
    const diagnostics = { atcBboxCandidates: 0, atcExactPolygonTests: 0, atsBboxCandidates: 0, atsGeodesicCalculations: 0, pointBboxCandidates: 0, pointDistanceCalculations: 0, aheadProjectedSteps: 0, aheadAirspaceQueries: 0 };
    const result = computeAtcContext(input(), prepared, new Date(), diagnostics);
    expect(result.primaryAirspace?.id).toBe("CZ-TMA");
    expect(diagnostics.atcBboxCandidates).toBe(2);
    expect(diagnostics.atcExactPolygonTests).toBe(2);
  });

  it("predicts a stable next sector with distance and ETA", () => {
    const next = sector({ id: "CZ-NEXT", name: "NEXT RADAR", polygons: [[[15, 49], [16, 49], [16, 50], [15, 50], [15, 49]]] });
    const result = computeAtcContext(input({ lon: 14.9 }), dataset([sector(), next]), new Date("2026-01-01T12:00:00.000Z"));
    expect(result.nextSector).toMatchObject({ airspace: { id: "CZ-NEXT" } });
    expect(result.nextSector?.estimatedSeconds).toBeGreaterThan(0);
    expect(result.nextSector?.distanceNm).toBeGreaterThan(0);
    expect(result.nextSector?.confidence).toBe("high");
  });

  it("does not predict a transition when the projected track stays in the current sector", () => {
    const result = computeAtcContext(input(), dataset([sector()]), new Date("2026-01-01T12:00:00.000Z"));
    expect(result.nextSector).toBeNull();
  });

  it("suppresses prediction for ground, slow, and stale aircraft", () => {
    const next = sector({ id: "CZ-NEXT", polygons: [[[15, 49], [16, 49], [16, 50], [15, 50], [15, 49]]] });
    const sectors = dataset([sector(), next]);
    expect(computeAtcContext(input({ lon: 14.9, onGround: true }), sectors, new Date("2026-01-01T12:00:00.000Z")).nextSector).toBeNull();
    expect(computeAtcContext(input({ lon: 14.9, groundSpeed: 10 }), sectors, new Date("2026-01-01T12:00:00.000Z")).nextSector).toBeNull();
    expect(computeAtcContext(input({ lon: 14.9, timestamp: "2026-01-01T11:55:00.000Z" }), sectors, new Date("2026-01-01T12:00:00.000Z")).nextSector).toBeNull();
  });
});
