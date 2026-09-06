import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { InMemoryStateBoundaryProvider, type StateBoundaryFeature, type StateBoundaryProvider } from "@/lib/atc/cz-boundary";
import { parseCzEaipEnr21 } from "@/lib/atc/cz-eaip";

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

  it("joins multiple features and preserves the Germany–Poland tripoint transition", () => {
    const provider = new InMemoryStateBoundaryProvider([
      boundaryFeature("state-a", [[0, 0], [0.01, 0]]),
      boundaryFeature("state-b", [[0.01, 0], [0.02, 0]]),
      boundaryFeature("tripoint", [[0.02, 0], [0.03, 0]], "tripoint"),
    ]);
    const result = provider.getBoundarySegment({ start: [0.001, 0.0005], end: [0.029, -0.0005], hint: "state boundary Germany - Poland" });
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
    expect(() => ambiguous.getBoundarySegment({ start: [0, 0], end: [0.01, 0.01] })).toThrow(/equally short/);

    const disconnected = new InMemoryStateBoundaryProvider([
      boundaryFeature("left", [[0, 0], [0.01, 0]]),
      boundaryFeature("right", [[0.03, 0], [0.04, 0]]),
    ]);
    expect(() => disconnected.getBoundarySegment({ start: [0.002, 0.001], end: [0.038, -0.001] })).toThrow(/No connected/);
  });
});

describe("Czech AIP state-boundary integration", () => {
  const fixture = readFileSync(new URL("./fixtures/cz-eaip-state-boundaries.html", import.meta.url), "utf8");
  const provider: StateBoundaryProvider = {
    getBoundarySegment(input) {
      return {
        coordinates: [input.start, [9.5, 49.5], input.end],
        startSnapDistanceKm: 0,
        endSnapDistanceKm: 0,
        pathLengthKm: 10,
        vertexCount: 3,
        maxSegmentLengthKm: 10,
        featureIds: ["fixture-state", "fixture-tripoint"],
      };
    },
  };

  it("resolves all six border PART constructions, inherits only unanimous aggregate limits, and keeps aggregates skipped", () => {
    const result = parseCzEaipEnr21(fixture, { stateBoundaryProvider: provider, lastVerifiedAt: "2026-09-06T00:00:00.000Z" });
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
});
