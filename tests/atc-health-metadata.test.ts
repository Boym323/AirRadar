import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getPrisma: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getPrisma: mocks.getPrisma }));

import { getStoredAtcMetadata, resetAtcMetadataCacheForTests } from "@/lib/server/atc-data";

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
});
