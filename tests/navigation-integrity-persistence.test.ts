import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NavigationIntegrityObservation } from "@/lib/navigation-integrity/types";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
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
  beforeEach(async () => {
    vi.resetModules();
    mocks.upsert.mockReset();
    mocks.track.mockClear();
    mocks.getPrisma.mockReturnValue({ orm: { public: { NavigationIntegrityObservation: { upsert: mocks.upsert } } } });
    const { resetNavigationWriteMemoForTests } = await import("@/lib/server/navigation-integrity");
    resetNavigationWriteMemoForTests();
  });

  it("uses an atomic native upsert with only immutable-key self-update on duplicates", async () => {
    const { persistNavigationIntegrityObservation } = await import("@/lib/server/navigation-integrity");
    const rows = new Map<string, unknown>();
    mocks.upsert.mockImplementation(async ({ conflictOn, update, create }: {
      conflictOn: { dedupKey: string };
      update: { dedupKey: string };
      create: { dedupKey: string };
    }) => {
      expect(update).toEqual({ dedupKey: conflictOn.dedupKey });
      expect(create.dedupKey).toBe(conflictOn.dedupKey);
      if (rows.has(conflictOn.dedupKey)) return rows.get(conflictOn.dedupKey);
      rows.set(conflictOn.dedupKey, create);
      return create;
    });
    await persistNavigationIntegrityObservation(sample());
    const original = mocks.upsert.mock.calls[0]?.[0]?.create;
    await persistNavigationIntegrityObservation(sample());
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(rows.size).toBe(1);
    expect([...rows.values()][0]).toEqual(original);
    expect(original.dedupKey).toMatch(/^v2:ABC123:/);
  });

  it("retains both meaningfully moved observations in the same minute and same timestamp", async () => {
    const { persistNavigationIntegrityObservation } = await import("@/lib/server/navigation-integrity");
    const rows = new Map<string, { lat: number; lon: number }>();
    mocks.upsert.mockImplementation(async ({ conflictOn, update, create }: {
      conflictOn: { dedupKey: string };
      update: { dedupKey: string };
      create: { dedupKey: string; lat: number; lon: number };
    }) => {
      expect(update).toEqual({ dedupKey: conflictOn.dedupKey });
      if (rows.has(conflictOn.dedupKey)) return rows.get(conflictOn.dedupKey);
      rows.set(conflictOn.dedupKey, { lat: create.lat, lon: create.lon });
      return create;
    });
    const first = sample();
    const moved = { ...first, lat: first.lat + 0.2, lon: first.lon + 0.2 };
    expect(first.observedAt).toBe(moved.observedAt);
    await persistNavigationIntegrityObservation(first);
    await persistNavigationIntegrityObservation(moved);
    expect(rows.size).toBe(2);
    expect([...rows.values()]).toEqual([{ lat: first.lat, lon: first.lon }, { lat: moved.lat, lon: moved.lon }]);
    await persistNavigationIntegrityObservation(first);
    expect(rows.size).toBe(2);
    expect(mocks.upsert).toHaveBeenCalledTimes(2);
  });

  it("does not collapse an altitude-band transition or integrity-state transition", async () => {
    const { persistNavigationIntegrityObservation } = await import("@/lib/server/navigation-integrity");
    mocks.upsert.mockResolvedValue({});
    const original = sample();
    const altitude = { ...original, altitudeBand: original.altitudeBand + 1, altitudeFt: 37_000 };
    const reduced = { ...original, sil: 0 };
    await persistNavigationIntegrityObservation(original);
    await persistNavigationIntegrityObservation(altitude);
    await persistNavigationIntegrityObservation(reduced);
    const keys = mocks.upsert.mock.calls.map((call) => call[0].conflictOn.dedupKey as string);
    expect(new Set(keys).size).toBe(3);
    expect(keys.every((key) => key.startsWith("v2:"))).toBe(true);
    expect(mocks.upsert.mock.calls.every((call) => Object.keys(call[0].update).join() === "dedupKey")).toBe(true);
  });

  it.each([
    ["timeout", Object.assign(new Error("ignored"), { cause: { code: "P2024" } })],
    ["constraint", Object.assign(new Error("ignored"), { meta: { driverAdapterError: { sqlState: "23505" } } })],
    ["other", { code: "XX000" }],
  ])("keeps %s DB failures isolated to the operation", async (_family, error) => {
    const { persistNavigationIntegrityObservation } = await import("@/lib/server/navigation-integrity");
    mocks.upsert.mockRejectedValueOnce(error);
    await expect(persistNavigationIntegrityObservation(sample())).rejects.toBe(error);
    expect(mocks.track).toHaveBeenCalledTimes(1);
  });

  it("can recover on the next write after a failed operation", async () => {
    const { persistNavigationIntegrityObservation } = await import("@/lib/server/navigation-integrity");
    const failure = Object.assign(new Error("ignored"), { code: "P2024" });
    mocks.upsert.mockRejectedValueOnce(failure).mockResolvedValueOnce({});
    await expect(persistNavigationIntegrityObservation(sample())).rejects.toBe(failure);
    await expect(persistNavigationIntegrityObservation(sample())).resolves.toBeUndefined();
    expect(mocks.upsert).toHaveBeenCalledTimes(2);
  });
  it("avoids repeated rc9 upserts and exposes only aggregate admin counters", async () => {
    const { persistNavigationIntegrityObservation, getNavigationWriteMemoDiagnostics } =
      await import("@/lib/server/navigation-integrity");
    mocks.upsert.mockResolvedValue({});
    for (let i = 0; i < 10; i += 1) await persistNavigationIntegrityObservation(sample());
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(getNavigationWriteMemoDiagnostics()).toEqual({
      scope: "process-local", confirmedKeys: 1, inFlight: 0,
      avoidedUpserts: 9, ttlMs: 120_000, maxKeys: 1024,
    });
  });

  it("coalesces concurrent identical writes and acknowledges only after success", async () => {
    const { persistNavigationIntegrityObservation, getNavigationWriteMemoDiagnostics } =
      await import("@/lib/server/navigation-integrity");
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    mocks.upsert.mockImplementation(async () => { await pending; return {}; });
    const first = persistNavigationIntegrityObservation(sample());
    const second = persistNavigationIntegrityObservation(sample());
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(getNavigationWriteMemoDiagnostics().confirmedKeys).toBe(0);
    finish();
    await Promise.all([first, second]);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(getNavigationWriteMemoDiagnostics().avoidedUpserts).toBe(1);
  });

  it("does not acknowledge failures and retries the same key successfully", async () => {
    const { persistNavigationIntegrityObservation, getNavigationWriteMemoDiagnostics } =
      await import("@/lib/server/navigation-integrity");
    const err = Object.assign(new Error("synthetic"), { code: "P2024" });
    mocks.upsert.mockRejectedValueOnce(err).mockResolvedValueOnce({});
    await expect(persistNavigationIntegrityObservation(sample())).rejects.toBe(err);
    expect(getNavigationWriteMemoDiagnostics().confirmedKeys).toBe(0);
    await persistNavigationIntegrityObservation(sample());
    expect(mocks.upsert).toHaveBeenCalledTimes(2);
    expect(getNavigationWriteMemoDiagnostics().confirmedKeys).toBe(1);
  });

  it("expires acknowledgements and bounds the number of retained keys", async () => {
    const { persistNavigationIntegrityObservation, getNavigationWriteMemoDiagnostics } =
      await import("@/lib/server/navigation-integrity");
    const clock = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    try {
      mocks.upsert.mockResolvedValue({});
      await persistNavigationIntegrityObservation(sample());
      clock.mockReturnValue(1_000_000 + 120_001);
      await persistNavigationIntegrityObservation(sample());
      expect(mocks.upsert).toHaveBeenCalledTimes(2);
      for (let index = 0; index < 1025; index += 1) {
        await persistNavigationIntegrityObservation({
          ...sample(), aircraftHex: `TEST${index.toString().padStart(5, "0")}`,
        });
      }
      expect(getNavigationWriteMemoDiagnostics().confirmedKeys).toBe(1024);
      expect(getNavigationWriteMemoDiagnostics().inFlight).toBe(0);
    } finally {
      clock.mockRestore();
    }
  });

});
