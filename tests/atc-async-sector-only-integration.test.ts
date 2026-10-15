import { describe, expect, it } from "vitest";
import {
  computeAtcContext, getCurrentAtcSectorIds,
  prepareAtcContextDataset, prepareAtcContextDatasetAsync,
  prepareAtcSectorDatasetAsync, getAtcSectorCandidatesFromIndex,
} from "@/lib/atc-context/engine";
import type { AtcContextDataset, AtcContextInput } from "@/lib/atc-context/types";
import type { AtcSector } from "@/lib/atc/types";

// Ensures #885 current-sector truth remains semantically identical after
// #878's event-loop-safe asynchronous preparation, without live services.
const sector = (id: string, west: number, east: number, upper: number | null = 40000): AtcSector => ({
  id, name: id, atcCallsign: id,
  airspaceType: "CTA_SECTOR", airspaceClass: "C",
  polygons: [[[west, 48.9], [east, 48.9], [east, 49.1], [west, 49.1], [west, 48.9]]],
  lowerAltitudeFt: 0, upperAltitudeFt: upper,
  lowerAltitudeReference: "AMSL", upperAltitudeReference: "AMSL",
  frequencies: [], validFrom: null, validTo: null, country: "CZ",
  source: "integration-fixture", sourceReference: "fixture://atc-twin-integration",
  lastVerifiedAt: "2026-10-15T00:00:00.000Z",
});
const point = (lat: number, lon: number, altitude: number): AtcContextInput => ({
  lat, lon, altitude, geomAltitude: altitude, baroAltitude: altitude,
  altitudeSource: "baro", track: 90, groundSpeed: 420,
  verticalRate: 0, timestamp: "2026-10-15T12:00:00.000Z",
});

describe("PR #878 + #885 ATC truth compatibility", () => {
  it("returns the same current-sector ids for synchronous and asynchronously prepared context", async () => {
    const scenarios: AtcContextDataset[] = [
      { sectors: [sector("WEST", 17.4, 17.6), sector("EAST", 17.6, 17.8),
        sector("LOW_ONLY", 17.4, 17.6, 15000)], routeDocuments: [] },
      { sectors: [sector("WEST", 17.5, 17.7), sector("EAST", 17.6, 17.8),
        sector("LOW_ONLY", 17.5, 17.7, 15000)], routeDocuments: [] },
    ];
    const observations = [
      point(49, 17.5, 12000), point(49, 17.6, 30000),
      point(49, 17.8, 30000), point(49, 18.1, 30000),
      point(49, 17.6, 45000), point(91, 17.6, 30000),
    ];
    for (const source of scenarios) {
      const sync = prepareAtcContextDataset(source);
      const asyncDataset = await prepareAtcContextDatasetAsync(source);
      const assignment = await prepareAtcSectorDatasetAsync(source.sectors);
      for (const input of observations) {
        const canonical = computeAtcContext(input, sync, new Date("2026-10-15T12:00:00.000Z"));
        const expected = canonical.currentAirspaces.map((s) => s.id).sort();
        expect([...getCurrentAtcSectorIds(input, sync)].sort()).toEqual(expected);
        expect([...getCurrentAtcSectorIds(input, asyncDataset)].sort()).toEqual(expected);
        expect(computeAtcContext(input, asyncDataset, new Date("2026-10-15T12:00:00.000Z")).currentAirspaces.map((s) => s.id).sort()).toEqual(expected);
        if (input.lat === 49 && input.lon >= 17.4 && input.lon <= 17.8) {
          const candidates = getAtcSectorCandidatesFromIndex(assignment, input.lon, input.lat);
          expect(candidates.every((s) => source.sectors.some((original) => original.id === s.id))).toBe(true);
        }
      }
      // Do not let caller-owned mutation invalidate an already published index.
      const oldIds = [...getCurrentAtcSectorIds(point(49, 17.5, 12000), asyncDataset)].sort();
      source.sectors[0]!.polygons[0]![0]![0] -= 0.2;
      expect([...getCurrentAtcSectorIds(point(49, 17.5, 12000), asyncDataset)].sort()).toEqual(oldIds);
    }
  }, 20_000);
});
