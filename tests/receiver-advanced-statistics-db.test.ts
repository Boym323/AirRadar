import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  failLoad: true,
  upserts: [] as Array<Record<string, unknown>>,
  getPrisma: vi.fn(),
}));

vi.mock("@/lib/server/db", () => ({ getPrisma: harness.getPrisma }));

import { ReceiverAdvancedStatistics } from "@/lib/server/receiver-advanced-statistics";

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
      first: async () => null,
      update: async () => undefined,
    }),
    create: async () => undefined,
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
});
