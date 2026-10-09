import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getPrisma: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getPrisma: mocks.getPrisma }));

import { getStoredAtcData, getStoredAtcMetadata, resetAtcMetadataCacheForTests } from "@/lib/server/atc-data";

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
    mocks.getPrisma.mockReturnValue({ orm: { public: {
      AtcSector: { select: vi.fn((...fields: string[]) => query(fields)) },
      AtcTransmitter: { select: vi.fn((...fields: string[]) => query(fields)) },
    } } });

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
    expect(mocks.getPrisma).toHaveBeenCalledTimes(1);
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
    mocks.getPrisma.mockReturnValue({ orm: { public: {
      AtcSector: model([sector]),
      AtcTransmitter: model([transmitter]),
    } } });

    const full = await getStoredAtcData();
    const fast = await getStoredAtcMetadata();
    expect(full?.metadata).toEqual(fast);
    expect(fast).toMatchObject({ status: "configured", sectorCount: 1, transmitterCount: 1 });
    expect(selected).toHaveLength(2);
    expect(selected.flat()).not.toContain("polygonJson");
  });
});
