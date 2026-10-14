import { describe, expect, it, vi } from "vitest";
import type { AtcDataResponse, AtcSector } from "@/lib/atc/types";

const mocks = vi.hoisted(() => ({
  getAtcDataSnapshot: vi.fn(),
}));

vi.mock("@/lib/server/providers", () => ({ getAtcDataSnapshot: mocks.getAtcDataSnapshot }));
vi.mock("@/lib/ats/cz-routes", () => ({ loadCzAtsRoutes: () => null }));
vi.mock("@/lib/ats/sk-routes", () => ({ loadSkAtsRoutes: () => null }));
vi.mock("@/lib/ats/at-routes", () => ({ loadAtAtsRoutes: () => null }));

import { invalidateAtcContextDatasetCache, loadAtcContextDataset } from "@/lib/atc-context/engine";

function sector(id: string): AtcSector {
  return {
    id,
    name: id,
    atcCallsign: null,
    service: "ACC",
    polygons: [[[14, 49], [15, 49], [15, 50], [14, 49]]],
    lowerAltitudeFt: null,
    upperAltitudeFt: null,
    frequencies: [],
    validFrom: null,
    validTo: null,
    country: "CZ",
    source: "test",
    sourceReference: "test://context-race",
    lastVerifiedAt: "2026-01-01T00:00:00.000Z",
  };
}

function snapshot(sectors: AtcSector[]): AtcDataResponse {
  return {
    sectors,
    transmitters: [],
    metadata: {
      status: "configured",
      source: "test",
      sourceReference: "test://context-race",
      effectiveDate: null,
      lastVerifiedAt: "2026-01-01T00:00:00.000Z",
      sectorCount: sectors.length,
      transmitterCount: 0,
    },
  };
}

describe("ATC context dataset generation races", () => {
  it("does not publish the old dataset when invalidation occurs during preparation", async () => {
    const oldSectors = Array.from({ length: 2500 }, (_, index) => sector(`OLD-${index}`));
    const newSectors = [sector("NEW")];
    let current = oldSectors;
    let readStarted!: () => void;
    const started = new Promise<void>((resolve) => { readStarted = resolve; });
    mocks.getAtcDataSnapshot.mockImplementation(async () => {
      readStarted();
      return snapshot(current);
    });

    const pending = loadAtcContextDataset();
    await started;
    // The preparation code yields at fixed sector boundaries. Queue this
    // invalidation before the first scheduled continuation, making the race
    // deterministic rather than dependent on a wall-clock timeout.
    await new Promise<void>((resolve) => setImmediate(resolve));
    current = newSectors;
    invalidateAtcContextDatasetCache();

    const result = await pending;
    expect(result?.sectors.map((value) => value.id)).toEqual(["NEW"]);
    expect(mocks.getAtcDataSnapshot).toHaveBeenCalledTimes(2);
  });
});
