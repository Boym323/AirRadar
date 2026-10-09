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
  beforeEach(() => {
    vi.resetModules();
    mocks.upsert.mockReset();
    mocks.track.mockClear();
    mocks.getPrisma.mockReturnValue({ orm: { public: { NavigationIntegrityObservation: { upsert: mocks.upsert } } } });
  });

  it("uses the dedup unique key as an idempotent upsert and does not rewrite history", async () => {
    const { persistNavigationIntegrityObservation } = await import("@/lib/server/navigation-integrity");
    mocks.upsert.mockResolvedValueOnce({}).mockResolvedValueOnce({});
    await persistNavigationIntegrityObservation(sample());
    await persistNavigationIntegrityObservation(sample());
    expect(mocks.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.upsert.mock.calls[0]?.[0]).toMatchObject({ conflictOn: { dedupKey: "ABC123:29859000:LOCAL:8:8:3" }, update: {} });
    expect(mocks.upsert.mock.calls[1]?.[0]).toMatchObject({ conflictOn: { dedupKey: "ABC123:29859000:LOCAL:8:8:3" }, update: {} });
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
});
