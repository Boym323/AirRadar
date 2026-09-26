import { describe, expect, it } from "vitest";
import type { AtcSector } from "@/lib/atc/types";
import { predictNextSectorBoundary } from "@/lib/atc-context/prediction";

const now = new Date("2026-09-26T12:00:00.000Z");
function sector(id: string, polygon: [number, number][]): AtcSector {
  return { id, name: id, atcCallsign: id, polygons: [polygon], lowerAltitudeFt: null, upperAltitudeFt: null, frequencies: [], validFrom: null, validTo: null, country: "CZ", source: "fixture", sourceReference: "fixture", lastVerifiedAt: now.toISOString() };
}
const east = sector("EAST", [[14.2, 49.9], [14.6, 49.9], [14.6, 50.1], [14.2, 50.1]]);
const north = sector("NORTH", [[13.9, 50.2], [14.3, 50.2], [14.3, 50.5], [13.9, 50.5]]);
const input = { longitude: 14, latitude: 50, track: 90, groundSpeed: 120, observedAt: now, now };

describe("ATC sector boundary prediction", () => {
  it("finds a straight crossing and derives ETA from groundspeed", () => {
    expect(predictNextSectorBoundary([east], input)).toMatchObject({ nextSector: "EAST", confidence: "high", estimatedEntrySeconds: expect.any(Number), source: "sector_geometry" });
  });

  it("does not invent a crossing for a parallel boundary or stale aircraft", () => {
    expect(predictNextSectorBoundary([east], { ...input, track: 0 })).toBeNull();
    expect(predictNextSectorBoundary([east], { ...input, observedAt: new Date(now.getTime() - 121_000) })).toBeNull();
  });

  it("selects the nearest of multiple candidates and lowers confidence when ambiguous", () => {
    const nearer = sector("EAST_NEAR", [[14.18, 49.9], [14.28, 49.9], [14.28, 50.1], [14.18, 50.1]]);
    expect(predictNextSectorBoundary([east, nearer], input)).toMatchObject({ nextSector: "EAST_NEAR", confidence: "low" });
  });

  it("returns no sector outside the forward look-ahead", () => {
    expect(predictNextSectorBoundary([north], input)).toBeNull();
  });
});
