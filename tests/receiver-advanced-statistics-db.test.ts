import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  failLoad: true,
  upserts: [] as Array<Record<string, unknown>>,
  altitudeUpserts: [] as Array<Record<string, unknown>>,
  getPrisma: vi.fn(),
}));

vi.mock("@/lib/server/db", () => ({ getPrisma: harness.getPrisma }));

import { ReceiverAdvancedStatistics } from "@/lib/server/receiver-advanced-statistics";
import { normalizeAircraft } from "@/lib/aircraft/normalize";

function database() {
  const stats = {
    where: () => ({
      first: async () => {
        if (harness.failLoad) throw new Error("database temporarily unavailable");
        return {
          date: "2026-09-10",
          receiverMessagesCount: 500,
          receiverMessagesRawLast: 900,
          maxGroundSpeedKt: null,
          maxGroundSpeedIcaoHex: null,
          maxGroundSpeedRegistration: null,
          maxGroundSpeedCallsign: null,
          maxGroundSpeedAt: null,
        };
      },
    }),
    upsert: async (args: Record<string, unknown>) => {
      harness.upserts.push(args);
    },
  };
  const altitude = {
    where: () => ({
      all: async () => {
        if (harness.failLoad) throw new Error("database temporarily unavailable");
        return [];
      },
    }),
    upsert: async (args: Record<string, unknown>) => {
      harness.altitudeUpserts.push(args);
    },
  };
  const schema = { ReceiverDailyStats: stats, ReceiverDailyCoverageAltitude: altitude };
  return {
    orm: { public: schema },
    transaction: async (callback: (client: { orm: { public: typeof schema } }) => Promise<void>) => callback({ orm: { public: schema } }),
  };
}

describe("advanced receiver persistence bootstrap", () => {
  beforeEach(() => {
    harness.failLoad = true;
    harness.upserts.length = 0;
    harness.altitudeUpserts.length = 0;
    harness.getPrisma.mockReset();
    harness.getPrisma.mockImplementation(() => database());
  });

  it("does not overwrite persisted counters after a transient startup load failure", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const stats = new ReceiverAdvancedStatistics("Europe/Prague");
    const at = new Date("2026-09-10T12:00:00.000Z");

    stats.observe([], 1_000, at);
    await stats.close();
    expect(stats.getSnapshot(at).receiverMessagesCount).toBeNull();
    expect(harness.upserts).toHaveLength(0);

    harness.failLoad = false;
    stats.observe([], 1_100, new Date(at.getTime() + 5_000));
    await stats.close();

    expect(stats.getSnapshot(at)).toMatchObject({ receiverMessagesCount: 700, receiverMessagesRawLast: 1_100 });
    expect(harness.upserts).toHaveLength(1);
    expect(harness.upserts[0]).toMatchObject({
      update: { receiverMessagesCount: 700, receiverMessagesRawLast: 1_100 },
    });
    errorSpy.mockRestore();
  });

  it("persists a changed altitude cell with one upsert and no read-before-write", async () => {
    harness.failLoad = false;
    const stats = new ReceiverAdvancedStatistics("Europe/Prague");
    const at = new Date("2026-09-10T12:00:00.000Z");
    const item = normalizeAircraft({ hex: "ABC123", lat: 50.1, lon: 14.1, alt_baro: 10_000, gs: 300 }, { lat: 50, lon: 14, name: "Test" }, at);
    if (!item) throw new Error("aircraft normalization failed");
    item.distanceKm = 120;
    item.bearing = 45;

    stats.observe([item], null, at);
    await stats.close();

    expect(harness.altitudeUpserts).toHaveLength(1);
    expect(harness.altitudeUpserts[0]).toMatchObject({
      update: { maxDistanceKm: 120 },
      create: { date: "2026-09-10", azimuthBucket: 4, altitudeBand: 1, maxDistanceKm: 120 },
    });
  });
});
