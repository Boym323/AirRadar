import { afterEach, describe, expect, it, vi } from "vitest";
import { closeStaleFlights, staleFlightEndTime } from "@/lib/server/history";

afterEach(() => vi.unstubAllEnvs());

describe("historical flight maintenance", () => {
  it("uses lastSeenAt as the end time after the continuity gap", () => {
    const lastSeenAt = new Date("2026-01-01T12:00:00Z");
    const now = new Date("2026-01-01T12:02:01Z");
    expect(staleFlightEndTime(lastSeenAt, now, 120_000)).toEqual(lastSeenAt);
    expect(staleFlightEndTime(lastSeenAt, new Date("2026-01-01T12:02:00Z"), 120_000)).toBeNull();
  });

  it("closes open stale flights without using the cleanup time as endTime", async () => {
    vi.stubEnv("FLIGHT_CONTINUITY_GAP_MS", "60000");
    const lastSeenAt = new Date("2026-01-01T12:00:00Z");
    const update = vi.fn().mockResolvedValue(undefined);
    const flight = { id: 7, lastSeenAt };
    const Flight = {
      where: vi.fn((filter: Record<string, unknown>) => "endTime" in filter
        ? { where: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue([flight]) }) }
        : { update }),
    };
    const database = { orm: { public: { Flight } } } as never;
    await closeStaleFlights(database, new Date("2026-01-01T12:02:00Z"));
    expect(update).toHaveBeenCalledWith({ endTime: lastSeenAt });
  });
});
