import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NavigationIntegrityObservation } from "@/lib/navigation-integrity/types";

const mocks = vi.hoisted(() => ({
  createAndCount: vi.fn(),
  track: vi.fn(async (_lane: string, operation: () => Promise<unknown>) => operation()),
  getPrisma: vi.fn(),
}));

vi.mock("@/lib/server/db", () => ({ getPrisma: mocks.getPrisma }));
vi.mock("@/lib/server/db-operation-diagnostics", () => ({ trackDbOperation: mocks.track }));

function sample(): NavigationIntegrityObservation {
  return {
    aircraftHex: "ABC123", flightId: null, observedAt: "2026-10-09T10:00:00.000Z", receivedAt: "2026-10-09T10:00:00.000Z",
    lat: 49.2, lon: 16.6, altitudeFt: 30_000, altitudeBand: 3,
    nic: 8, nacP: 8, nacV: 3, sil: 3, sda: 3, gva: 3, adsbVersion: 2,
    positionSource: "ADS-B", source: "LOCAL", provider: "readsb", quality: "HIGH", confidence: "HIGH",
    provenance: { origin: "local", positionObservedAt: "2026-10-09T10:00:00.000Z", fields: {} },
  };
}

describe("navigation integrity persistence", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createAndCount.mockReset();
    mocks.track.mockClear();
    mocks.getPrisma.mockReturnValue({ orm: { public: { NavigationIntegrityObservation: { createAndCount: mocks.createAndCount } } } });
  });

  it("uses an atomic insert-or-skip and preserves the first historical row", async () => {
    const { persistNavigationIntegrityObservation } = await import("@/lib/server/navigation-integrity");
    const rows = new Map<string, unknown>();
    mocks.createAndCount.mockImplementation(async ([row]: [{ dedupKey: string }], options: unknown) => {
      expect(options).toEqual({ onConflict: "skip", conflictOn: ["dedupKey"] });
      if (rows.has(row.dedupKey)) return 0;
      rows.set(row.dedupKey, row);
      return 1;
    });
    const first = await persistNavigationIntegrityObservation(sample());
    const original = mocks.createAndCount.mock.calls[0]?.[0]?.[0];
    const second = await persistNavigationIntegrityObservation(sample());
    expect([first, second]).toEqual([true, false]);
    expect(rows.size).toBe(1);
    expect([...rows.values()][0]).toEqual(original);
    expect(original.dedupKey).toMatch(/^v2:ABC123:/);
  });

  it("retains both meaningfully moved observations in the same minute and same timestamp", async () => {
    const { persistNavigationIntegrityObservation } = await import("@/lib/server/navigation-integrity");
    const rows = new Map<string, { lat: number; lon: number }>();
    mocks.createAndCount.mockImplementation(async ([row]: [{ dedupKey: string; lat: number; lon: number }]) => {
      if (rows.has(row.dedupKey)) return 0;
      rows.set(row.dedupKey, { lat: row.lat, lon: row.lon });
      return 1;
    });
    const first = sample();
    const moved = { ...first, lat: first.lat + 0.2, lon: first.lon + 0.2 };
    expect(first.observedAt).toBe(moved.observedAt);
    expect(await persistNavigationIntegrityObservation(first)).toBe(true);
    expect(await persistNavigationIntegrityObservation(moved)).toBe(true);
    expect(rows.size).toBe(2);
    expect([...rows.values()]).toEqual([{ lat: first.lat, lon: first.lon }, { lat: moved.lat, lon: moved.lon }]);
    expect(await persistNavigationIntegrityObservation(first)).toBe(false);
    expect(rows.size).toBe(2);
  });

  it("does not collapse an altitude-band transition or integrity-state transition", async () => {
    const { persistNavigationIntegrityObservation } = await import("@/lib/server/navigation-integrity");
    mocks.createAndCount.mockResolvedValue(1);
    const original = sample();
    const altitude = { ...original, altitudeBand: original.altitudeBand + 1, altitudeFt: 37_000 };
    const reduced = { ...original, sil: 0 };
    await persistNavigationIntegrityObservation(original);
    await persistNavigationIntegrityObservation(altitude);
    await persistNavigationIntegrityObservation(reduced);
    const keys = mocks.createAndCount.mock.calls.map((call) => call[0][0].dedupKey as string);
    expect(new Set(keys).size).toBe(3);
    expect(keys.every((key) => key.startsWith("v2:"))).toBe(true);
  });

  it.each([
    ["timeout", Object.assign(new Error("ignored"), { cause: { code: "P2024" } })],
    ["constraint", Object.assign(new Error("ignored"), { meta: { driverAdapterError: { sqlState: "23505" } } })],
    ["other", { code: "XX000" }],
  ])("keeps %s DB failures isolated to the operation", async (_family, error) => {
    const { persistNavigationIntegrityObservation } = await import("@/lib/server/navigation-integrity");
    mocks.createAndCount.mockRejectedValueOnce(error);
    await expect(persistNavigationIntegrityObservation(sample())).rejects.toBe(error);
    expect(mocks.track).toHaveBeenCalledTimes(1);
  });

  it("can recover on the next write after a failed operation", async () => {
    const { persistNavigationIntegrityObservation } = await import("@/lib/server/navigation-integrity");
    const failure = Object.assign(new Error("ignored"), { code: "P2024" });
    mocks.createAndCount.mockRejectedValueOnce(failure).mockResolvedValueOnce(1);
    await expect(persistNavigationIntegrityObservation(sample())).rejects.toBe(failure);
    await expect(persistNavigationIntegrityObservation(sample())).resolves.toBe(true);
    expect(mocks.createAndCount).toHaveBeenCalledTimes(2);
  });
});
