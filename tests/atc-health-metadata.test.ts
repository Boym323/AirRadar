import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getPrisma: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getPrisma: mocks.getPrisma }));

import { getAtcDatasetCacheDiagnostics, getStoredAtcData, getStoredAtcDataSnapshot, getStoredAtcMetadata, invalidateAtcDataCache, resetAtcMetadataCacheForTests } from "@/lib/server/atc-data";

function database(models: Record<string, unknown>, version: { value: string; reads?: number; error?: Error } = { value: "v1" }) {
  const publicSchema = {
    ...models,
    AtcDatasetVersion: {
      where: () => ({ select: () => ({ limit: () => ({ all: async () => {
        version.reads = (version.reads ?? 0) + 1;
        if (version.error) throw version.error;
        return [{ version: version.value }];
      } }) }) }),
    },
  };
  return {
    orm: { public: publicSchema },
    transaction: async (callback: (transaction: { orm: { public: typeof publicSchema } }) => Promise<unknown>) => callback({ orm: { public: publicSchema } }),
  };
}

describe("ATC health metadata fast path", () => {
  beforeEach(() => {
    resetAtcMetadataCacheForTests();
    vi.clearAllMocks();
  });

  it("coalesces parallel misses and caches metadata without selecting polygonJson", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const selected: string[][] = [];
    const query = (fields: string[]) => ({
      limit: () => ({ all: async () => {
        selected.push(fields);
        await gate;
        return fields.includes("frequencyMhz")
          ? [{ source: "test", sourceReference: "test://atc", validFrom: null, validTo: null, lastVerifiedAt: "2026-01-01T00:00:00.000Z", frequencyMhz: 118.1 }]
          : [{ source: "test", sourceReference: "test://atc", validFrom: null, validTo: null, lastVerifiedAt: "2026-01-01T00:00:00.000Z" }];
      } }),
    });
    mocks.getPrisma.mockReturnValue(database({
      AtcSector: { select: vi.fn((...fields: string[]) => query(fields)) },
      AtcTransmitter: { select: vi.fn((...fields: string[]) => query(fields)) },
    }));

    const first = getStoredAtcMetadata();
    const second = getStoredAtcMetadata();
    await Promise.resolve();
    expect(mocks.getPrisma).toHaveBeenCalledTimes(1);
    expect(selected).toHaveLength(2);
    expect(selected.flat()).not.toContain("polygonJson");
    release();
    const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual(b);
    expect(a).toMatchObject({ status: "configured", sectorCount: 1, transmitterCount: 1 });

    await getStoredAtcMetadata();
    expect(mocks.getPrisma).toHaveBeenCalledTimes(2);
    // A cache hit verifies one singleton version row and does not select the
    // bounded sector/transmitter fingerprints again.
    expect(selected).toHaveLength(2);
  });

  it("preserves the full dataset metadata for valid imported sectors and transmitters", async () => {
    const sector = {
      id: "CZ-TEST", name: "Test sector",
      polygonJson: JSON.stringify([[[14, 50], [15, 50], [15, 51], [14, 50]]]),
      lowerAltitudeFt: 0, upperAltitudeFt: 24500,
      lowerAltitudeReference: "SFC", upperAltitudeReference: "FL",
      atcCallsign: null, service: "APP", airspaceType: null, airspaceClass: null,
      remarks: null, primaryFrequencyMhz: 118.1, alternateFrequenciesJson: "[]",
      country: "CZ", source: "import", sourceReference: "test://atc",
      validFrom: null, validTo: null, lastVerifiedAt: "2026-10-09T12:00:00.000Z",
    };
    const transmitter = {
      id: "CZ-TX", name: "Test transmitter", latitude: 50, longitude: 14,
      service: "APP", frequencyMhz: 118.1, notes: null,
      source: "import", sourceReference: "test://atc",
      validFrom: null, validTo: null, lastVerifiedAt: "2026-10-09T12:00:00.000Z",
    };
    const selected: string[][] = [];
    const model = (records: unknown[]) => ({
      limit: () => ({ all: async () => records }),
      select: (...fields: string[]) => {
        selected.push(fields);
        return { limit: () => ({ all: async () =>
          records.map((record) => Object.fromEntries(fields.map((field) =>
            [field, (record as Record<string, unknown>)[field]]))) }) };
      },
    });
    mocks.getPrisma.mockReturnValue(database({
      AtcSector: model([sector]),
      AtcTransmitter: model([transmitter]),
    }));

    const full = await getStoredAtcData();
    const fast = await getStoredAtcMetadata();
    expect(full?.metadata).toEqual(fast);
    expect(fast).toMatchObject({ status: "configured", sectorCount: 1, transmitterCount: 1 });
    // The full dataset load also warms the metadata projection; no second
    // metadata query is needed and polygonJson is parsed only once.
    expect(selected).toHaveLength(0);
    expect(selected.flat()).not.toContain("polygonJson");
  });

  it("caches the complete bounded dataset, coalesces misses, and invalidates after import", async () => {
    let sectorLoads = 0;
    let transmitterLoads = 0;
    const version = { value: "stable", reads: 0 };
    const sector = {
      id: "CZ-CACHE", name: "Cached sector", polygonJson: JSON.stringify([[[14, 50], [15, 50], [15, 51], [14, 50]]]),
      lowerAltitudeFt: 0, upperAltitudeFt: 24500, lowerAltitudeReference: "SFC", upperAltitudeReference: "FL",
      atcCallsign: "CACHE", service: "APP", airspaceType: null, airspaceClass: null, remarks: null,
      primaryFrequencyMhz: 118.1, alternateFrequenciesJson: "[]", country: "CZ", source: "import", sourceReference: "test://cache",
      validFrom: null, validTo: null, lastVerifiedAt: "2026-10-09T12:00:00.000Z",
    };
    const model = (records: unknown[], onLoad: () => void) => ({
      limit: () => ({ all: async () => { onLoad(); return records; } }),
      select: (...fields: string[]) => ({ limit: () => ({ all: async () => records.map((record) => Object.fromEntries(fields.map((field) => [field, (record as Record<string, unknown>)[field]]))) }) }),
    });
    mocks.getPrisma.mockReturnValue(database({
      AtcSector: model([sector], () => { sectorLoads += 1; }),
      AtcTransmitter: model([], () => { transmitterLoads += 1; }),
    }, version));

    const [first, second] = await Promise.all([getStoredAtcData(), getStoredAtcData()]);
    expect(first).toEqual(second);
    expect(first?.sectors[0]?.polygons).toEqual([[[14, 50], [15, 50], [15, 51], [14, 50]]]);
    expect(sectorLoads).toBe(1);
    expect(transmitterLoads).toBe(1);
    expect(getAtcDatasetCacheDiagnostics()).toMatchObject({ hits: 0, misses: 2, entries: 1, inFlight: false });

    const cached = await getStoredAtcData();
    expect(cached).toEqual(first);
    expect(sectorLoads).toBe(1);
    expect(getAtcDatasetCacheDiagnostics()).toMatchObject({ hits: 1, misses: 2, entries: 1 });
    expect(version.reads).toBe(3);

    invalidateAtcDataCache();
    await getStoredAtcData();
    expect(sectorLoads).toBe(2);
    expect(getAtcDatasetCacheDiagnostics()).toMatchObject({ invalidations: 1, entries: 1 });
  });

  it("detects an external import through the bounded database fingerprint", async () => {
    const sector = {
      id: "CZ-EXTERNAL", name: "Before import", polygonJson: JSON.stringify([[[14, 50], [15, 50], [15, 51], [14, 50]]]),
      lowerAltitudeFt: 0, upperAltitudeFt: 24500, lowerAltitudeReference: "SFC", upperAltitudeReference: "FL",
      atcCallsign: null, service: "APP", airspaceType: null, airspaceClass: null, remarks: null,
      primaryFrequencyMhz: 118.1, alternateFrequenciesJson: "[]", country: "CZ", source: "import", sourceReference: "test://external",
      validFrom: null, validTo: null, lastVerifiedAt: "2026-10-09T12:00:00.000Z", updatedAt: "2026-10-09T12:00:00.000Z",
    };
    let fullLoads = 0;
    const model = (records: unknown[]) => ({
      limit: () => ({ all: async () => { fullLoads += 1; return records; } }),
      select: (...fields: string[]) => ({ limit: () => ({ all: async () => records.map((record) => Object.fromEntries(fields.map((field) => [field, (record as Record<string, unknown>)[field]]))) }) }),
    });
    const version = { value: "before" };
    mocks.getPrisma.mockReturnValue(database({ AtcSector: model([sector]), AtcTransmitter: model([]) }, version));
    await getStoredAtcData();
    expect((await getStoredAtcMetadata())?.lastVerifiedAt).toBe("2026-10-09T12:00:00.000Z");
    sector.name = "After external import";
    sector.lastVerifiedAt = "2026-10-10T12:00:00.000Z";
    sector.updatedAt = "2026-10-10T12:00:00.000Z";
    version.value = "after";
    const refreshed = await getStoredAtcData();
    expect(refreshed?.sectors[0]?.name).toBe("After external import");
    expect((await getStoredAtcMetadata())?.lastVerifiedAt).toBe("2026-10-10T12:00:00.000Z");
    expect(fullLoads).toBe(4);
  });

  it("re-evaluates validity and metadata on cache hits", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-09T12:00:00.000Z"));
    try {
      const rows = [{
        id: "ACTIVE", name: "Active", polygonJson: JSON.stringify([[[14, 50], [15, 50], [15, 51], [14, 50]]]),
        lowerAltitudeFt: 0, upperAltitudeFt: 24500, lowerAltitudeReference: null, upperAltitudeReference: null,
        atcCallsign: null, service: "APP", airspaceType: null, airspaceClass: null, remarks: null,
        primaryFrequencyMhz: 118.1, alternateFrequenciesJson: "[]", country: "CZ", source: "import", sourceReference: "test://time",
        validFrom: "2026-10-10T00:00:00.000Z", validTo: "2026-10-12T00:00:00.000Z", lastVerifiedAt: "2026-10-09T12:00:00.000Z", updatedAt: "2026-10-09T12:00:00.000Z",
      }];
      const model = (records: unknown[]) => ({
        limit: () => ({ all: async () => records }),
        select: (...fields: string[]) => ({ limit: () => ({ all: async () => records.map((record) => Object.fromEntries(fields.map((field) => [field, (record as Record<string, unknown>)[field]]))) }) }),
      });
      mocks.getPrisma.mockReturnValue(database({ AtcSector: model(rows), AtcTransmitter: model([]) }));
      expect((await getStoredAtcData())?.sectors).toHaveLength(0);
      expect((await getStoredAtcMetadata())?.sectorCount).toBe(0);
      clock.mockReturnValue(Date.parse("2026-10-11T12:00:00.000Z"));
      expect((await getStoredAtcData())?.sectors).toHaveLength(1);
      expect((await getStoredAtcMetadata())?.sectorCount).toBe(1);
      clock.mockReturnValue(Date.parse("2026-10-13T12:00:00.000Z"));
      expect((await getStoredAtcData())?.sectors).toHaveLength(0);
      expect((await getStoredAtcMetadata())?.sectorCount).toBe(0);
    } finally {
      clock.mockRestore();
    }
  });

  it("does not publish a pre-import load when an external import commits during loading", async () => {
    let release!: () => void;
    let loads = 0;
    const oldSector = { id: "OLD", name: "Old", polygonJson: JSON.stringify([[[14, 50], [15, 50], [15, 51], [14, 50]]]), lowerAltitudeFt: null, upperAltitudeFt: null, lowerAltitudeReference: null, upperAltitudeReference: null, atcCallsign: null, service: "APP", airspaceType: null, airspaceClass: null, remarks: null, primaryFrequencyMhz: 118.1, alternateFrequenciesJson: "[]", country: "CZ", source: "import", sourceReference: "test://race", validFrom: null, validTo: null, lastVerifiedAt: "2026-10-09T12:00:00.000Z", updatedAt: "2026-10-09T12:00:00.000Z" };
    const newSector = { ...oldSector, id: "NEW", name: "New" };
    const model = (records: unknown[]) => ({
      limit: () => ({ all: async () => { loads += 1; if (loads === 1) await new Promise<void>((resolve) => { release = resolve; }); return records; } }),
      select: (...fields: string[]) => ({ limit: () => ({ all: async () => records.map((record) => Object.fromEntries(fields.map((field) => [field, (record as Record<string, unknown>)[field]]))) }) }),
    });
    const sectors: unknown[] = [oldSector];
    const version = { value: "before" };
    mocks.getPrisma.mockReturnValue(database({ AtcSector: model(sectors), AtcTransmitter: model([]) }, version));
    const pending = getStoredAtcData();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    sectors[0] = newSector;
    version.value = "after";
    release();
    expect((await pending)?.sectors[0]?.name).toBe("New");
    expect(loads).toBeGreaterThanOrEqual(2);
  });

  it("refreshes geometry when the version changes even if id and timestamps do not", async () => {
    const sector = { id: "GEOMETRY", name: "Stable name", polygonJson: JSON.stringify([[[14, 50], [15, 50], [15, 51], [14, 50]]]), lowerAltitudeFt: null, upperAltitudeFt: null, lowerAltitudeReference: null, upperAltitudeReference: null, atcCallsign: null, service: "APP", airspaceType: null, airspaceClass: null, remarks: null, primaryFrequencyMhz: 118.1, alternateFrequenciesJson: "[]", country: "CZ", source: "import", sourceReference: "test://same-timestamp", validFrom: null, validTo: null, lastVerifiedAt: "2026-10-09T12:00:00.000Z" };
    const model = (records: unknown[]) => ({
      limit: () => ({ all: async () => records }),
      select: (...fields: string[]) => ({ limit: () => ({ all: async () => records.map((record) => Object.fromEntries(fields.map((field) => [field, (record as Record<string, unknown>)[field]]))) }) }),
    });
    const version = { value: "v1" };
    mocks.getPrisma.mockReturnValue(database({ AtcSector: model([sector]), AtcTransmitter: model([]) }, version));
    const first = await getStoredAtcDataSnapshot();
    expect(first?.sectors[0]?.polygons[0]?.[0]).toEqual([14, 50]);
    expect(Object.isFrozen(first?.sectors[0]?.polygons[0]?.[0])).toBe(true);

    sector.polygonJson = JSON.stringify([[[14.25, 50], [15.25, 50], [15.25, 51], [14.25, 50]]]);
    version.value = "v2";
    const second = await getStoredAtcDataSnapshot();
    expect(second?.sectors[0]?.polygons[0]?.[0]).toEqual([14.25, 50]);
  });

  it("invalidates instead of serving stale data when version verification fails", async () => {
    const version: { value: string; error?: Error } = { value: "stable" };
    const sector = { id: "FAIL", name: "Stable", polygonJson: JSON.stringify([[[14, 50], [15, 50], [15, 51], [14, 50]]]), lowerAltitudeFt: null, upperAltitudeFt: null, lowerAltitudeReference: null, upperAltitudeReference: null, atcCallsign: null, service: "APP", airspaceType: null, airspaceClass: null, remarks: null, primaryFrequencyMhz: 118.1, alternateFrequenciesJson: "[]", country: "CZ", source: "import", sourceReference: "test://failure", validFrom: null, validTo: null, lastVerifiedAt: "2026-10-09T12:00:00.000Z" };
    const model = (records: unknown[]) => ({
      limit: () => ({ all: async () => records }),
      select: (...fields: string[]) => ({ limit: () => ({ all: async () => records.map((record) => Object.fromEntries(fields.map((field) => [field, (record as Record<string, unknown>)[field]]))) }) }),
    });
    mocks.getPrisma.mockReturnValue(database({ AtcSector: model([sector]), AtcTransmitter: model([]) }, version));
    expect(await getStoredAtcData()).not.toBeNull();
    version.error = new Error("version query failed");
    expect(await getStoredAtcData()).toBeNull();
    expect(getAtcDatasetCacheDiagnostics().loadFailures).toBeGreaterThan(0);
    expect(getAtcDatasetCacheDiagnostics().entries).toBe(0);
  });

  it("fails soft when both bounded consistency attempts observe an import", async () => {
    const version = { value: "v1" };
    const sector = { id: "RETRY", name: "Changing", polygonJson: JSON.stringify([[[14, 50], [15, 50], [15, 51], [14, 50]]]), lowerAltitudeFt: null, upperAltitudeFt: null, lowerAltitudeReference: null, upperAltitudeReference: null, atcCallsign: null, service: "APP", airspaceType: null, airspaceClass: null, remarks: null, primaryFrequencyMhz: 118.1, alternateFrequenciesJson: "[]", country: "CZ", source: "import", sourceReference: "test://retry", validFrom: null, validTo: null, lastVerifiedAt: "2026-10-09T12:00:00.000Z" };
    let loads = 0;
    const model = (records: unknown[], onLoad?: () => void) => ({
      limit: () => ({ all: async () => { onLoad?.(); return records; } }),
      select: (...fields: string[]) => ({ limit: () => ({ all: async () => records.map((record) => Object.fromEntries(fields.map((field) => [field, (record as Record<string, unknown>)[field]]))) }) }),
    });
    mocks.getPrisma.mockReturnValue(database({
      AtcSector: model([sector], () => { loads += 1; version.value = loads === 1 ? "v2" : "v3"; }),
      AtcTransmitter: model([]),
    }, version));
    await expect(getStoredAtcData()).resolves.toBeNull();
    expect(loads).toBe(2);
    expect(getAtcDatasetCacheDiagnostics().loadFailures).toBe(1);
  });
});
