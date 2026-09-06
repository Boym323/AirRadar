import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeAircraft } from "@/lib/aircraft/normalize";
import { getPrisma } from "@/lib/server/db";
import { closeStaleFlights, recordAircraftSnapshot, staleFlightEndTime } from "@/lib/server/history";

vi.mock("@/lib/server/db", () => ({ getPrisma: vi.fn() }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(getPrisma).mockReset();
});

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
    expect(update).toHaveBeenCalledWith({ endTime: expect.anything() });
    expect((update.mock.calls[0]?.[0] as { endTime: Temporal.Instant }).endTime.epochMilliseconds).toBe(lastSeenAt.getTime());
  });

  it("ends a continuity-broken flight at its last observation and starts a new one", async () => {
    vi.stubEnv("FLIGHT_CONTINUITY_GAP_MS", "600000");
    const lastSeenAt = new Date("2026-01-01T12:00:00Z");
    const recordedAt = new Date("2026-01-01T12:20:00Z");
    const oldFlight = { id: 7, callsign: "TEST123", lastSeenAt, endTime: null };
    const update = vi.fn().mockImplementation(async (values: Record<string, unknown>) => {
      Object.assign(oldFlight, values);
    });
    const flightCreate = vi.fn().mockResolvedValue({ id: 8 });
    const aircraft = normalizeAircraft(
      { hex: "ABC123", flight: "TEST123", lat: 50, lon: 14 },
      { lat: 50, lon: 14, name: "Test" },
      recordedAt,
    );
    if (!aircraft) throw new Error("test aircraft could not be normalized");

    const flightWhere = vi.fn((filter: Record<string, unknown>) => {
      if ("aircraftId" in filter) {
        return {
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(oldFlight) }),
          }),
        };
      }
      if ("id" in filter) return { update };
      return { where: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue([]) }) };
    });
    const database = {
      orm: {
        public: {
          Aircraft: { where: vi.fn().mockReturnValue({ upsert: vi.fn().mockResolvedValue({ id: 42 }) }) },
          Flight: { where: flightWhere, create: flightCreate },
          FlightPosition: {
            create: vi.fn().mockResolvedValue({ id: 99 }),
            where: vi.fn().mockReturnValue({ delete: vi.fn().mockResolvedValue(undefined) }),
          },
        },
      },
      transaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback(database),
    };
    vi.mocked(getPrisma).mockReturnValue(database as never);

    await recordAircraftSnapshot([aircraft], recordedAt);

    expect(update).toHaveBeenCalledWith({ endTime: expect.anything() });
    expect((update.mock.calls[0]?.[0] as { endTime: Temporal.Instant }).endTime.epochMilliseconds).toBe(lastSeenAt.getTime());
    expect(oldFlight.lastSeenAt).toEqual(lastSeenAt);
    expect(flightCreate).toHaveBeenCalledWith(expect.objectContaining({ startTime: expect.anything(), lastSeenAt: expect.anything() }));
    const createdFlight = flightCreate.mock.calls[0]?.[0] as {
      startTime: Temporal.Instant;
      lastSeenAt: Temporal.Instant;
    };
    expect(createdFlight.startTime.epochMilliseconds).toBe(recordedAt.getTime());
    expect(createdFlight.lastSeenAt.epochMilliseconds).toBe(recordedAt.getTime());
  });
});
