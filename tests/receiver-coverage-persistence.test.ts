import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Aircraft, NetworkProviderDiagnostics, ReceiverPosition } from "@/lib/aircraft/types";

const mocks = vi.hoisted(() => ({ getPrisma: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getPrisma: mocks.getPrisma }));

import { getHistoricalReceiverCoverage, ReceiverCoverageAnalytics } from "@/lib/server/receiver-coverage-analytics";

const receiver: ReceiverPosition = { lat: 50, lon: 14, name: "test" };

function aircraft(at: string, origin: "local" | "adsbhub"): Aircraft {
  return {
    icaoHex: "ABC123", callsign: null, registration: null, aircraftType: null, aircraftDescription: null,
    lat: 50.1, lon: 14.1, altitude: 20_000, baroAltitude: 20_000, geomAltitude: null,
    groundSpeed: null, track: null, verticalRate: null, baroRate: null, geomRate: null,
    squawk: null, category: null, emergency: null, rssi: null, messages: null,
    seenSeconds: 0, seenPosSeconds: 0, lastSeen: at, source: "ADS-B", origin,
    provenance: {
      seenLocal: origin === "local",
      seenNetwork: origin !== "local",
      lastLocalSeen: origin === "local" ? at : null,
      lastNetworkSeen: origin !== "local" ? at : null,
      positionOrigin: origin,
      positionSource: "ADS-B",
    },
    sourceType: null, onGround: false, distanceKm: 0, bearing: 45, trail: [],
  };
}

function diagnostics(): NetworkProviderDiagnostics {
  return {
    enabled: true, status: "online", lastAttemptAt: null, lastSuccessAt: null, latencyMs: null,
    consecutiveFailures: 0, aircraftCount: 1, positionedAircraftCount: 1, mlatAircraftCount: 0,
    radiusNm: 175, pollIntervalMs: 10_000, retryAfterMs: null, selectedSource: "adsbhub",
  };
}

describe("ReceiverCoverageAnalytics persistence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.getPrisma.mockReset();
  });

  it("persists samples from adjacent hours into their own hourly rows", async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const where = vi.fn(() => ({
      first: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue(undefined),
    }));
    const table = { where, create };
    const database = {
      orm: { public: { ReceiverCoverageHourly: table } },
      transaction: async (callback: (transaction: unknown) => Promise<void>) => callback(database),
    };
    mocks.getPrisma.mockReturnValue(database);

    const analytics = new ReceiverCoverageAnalytics({ enabled: true, radiusNm: 175 });
    const sample = (analytics as unknown as { sample: (getSnapshot: () => unknown) => void }).sample.bind(analytics);

    const firstAt = new Date("2026-09-22T09:59:50.000Z");
    vi.setSystemTime(firstAt);
    sample(() => ({
      network: [aircraft(firstAt.toISOString(), "adsbhub")],
      local: new Map([["ABC123", aircraft(firstAt.toISOString(), "local")]]),
      receiver,
      localHealthy: true,
      providerDiagnostics: diagnostics(),
    }));

    const secondAt = new Date("2026-09-22T10:00:10.000Z");
    vi.setSystemTime(secondAt);
    sample(() => ({
      network: [aircraft(secondAt.toISOString(), "adsbhub")],
      local: new Map([["ABC123", aircraft(secondAt.toISOString(), "local")]]),
      receiver,
      localHealthy: true,
      providerDiagnostics: diagnostics(),
    }));

    await analytics.flush();

    const overallRows = create.mock.calls
      .map((call) => call[0] as { hour: Temporal.Instant; bucketKey: string })
      .filter((row) => row.bucketKey === "overall");
    expect(overallRows).toHaveLength(2);
    expect(overallRows.map((row) => row.hour.epochMilliseconds)).toEqual([
      Date.parse("2026-09-22T09:00:00.000Z"),
      Date.parse("2026-09-22T10:00:00.000Z"),
    ]);
  });

  it("pushes the historical lower bound into the database query", async () => {
    vi.setSystemTime(new Date("2026-09-22T10:30:00.000Z"));
    const where = vi.fn();
    const collection = { where, all: vi.fn().mockResolvedValue([]) };
    where.mockReturnValue(collection);
    mocks.getPrisma.mockReturnValue({ orm: { public: { ReceiverCoverageHourly: collection } } });

    await getHistoricalReceiverCoverage("7d");

    expect(where).toHaveBeenCalledOnce();
    const predicate = where.mock.calls[0]?.[0] as (row: { hour: { gte: (value: unknown) => unknown } }) => unknown;
    const gte = vi.fn().mockReturnValue(true);
    predicate({ hour: { gte } });
    expect(gte).toHaveBeenCalledOnce();
  });
});
