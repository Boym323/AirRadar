import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeAircraft } from "@/lib/aircraft/normalize";
import { getPrisma } from "@/lib/server/db";
import { closeStaleFlights, getAircraftHistory, recordAircraftSnapshot, staleFlightEndTime } from "@/lib/server/history";

vi.mock("@/lib/server/db", () => ({ getPrisma: vi.fn() }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(getPrisma).mockReset();
});

describe("historical flight maintenance", () => {
  it("deduplicates aircraft by ICAO hex and retries a concurrent insert conflict", async () => {
    const recordedAt = new Date("2026-01-01T12:00:00Z");
    const aircraft = normalizeAircraft(
      { hex: "ABC123", flight: "TEST123", lat: 50, lon: 14 },
      { lat: 50, lon: 14, name: "Test" },
      recordedAt,
    );
    if (!aircraft) throw new Error("test aircraft could not be normalized");

    const upsert = vi.fn().mockResolvedValue({ id: 42 });
    const flightCreate = vi.fn().mockResolvedValue({ id: 8 });
    const flightWhere = vi.fn().mockImplementation((filter: Record<string, unknown>) => {
      if ("aircraftId" in filter) {
        return {
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(null) }),
          }),
        };
      }
      return { where: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue([]) }) };
    });
    let transactionAttempts = 0;
    const database = {
      orm: {
        public: {
          Aircraft: { upsert },
          Flight: { where: flightWhere, create: flightCreate },
          FlightPosition: {
            create: vi.fn().mockResolvedValue({ id: 99 }),
            where: vi.fn().mockReturnValue({ delete: vi.fn().mockResolvedValue(undefined) }),
          },
        },
      },
      transaction: async (callback: (transaction: unknown) => Promise<unknown>) => {
        transactionAttempts += 1;
        if (transactionAttempts === 1) {
          throw { sqlState: "23505", constraint: "aircraft_icaoHex_key" };
        }
        return callback(database);
      },
    };
    vi.mocked(getPrisma).mockReturnValue(database as never);

    await recordAircraftSnapshot([aircraft, { ...aircraft, icaoHex: "abc123" }], recordedAt);

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ conflictOn: { icaoHex: "ABC123" } }));
    expect(flightCreate).toHaveBeenCalledTimes(1);
    expect(transactionAttempts).toBe(2);
  });

  it("reports partial batch failures without rejecting successful aircraft", async () => {
    const recordedAt = new Date("2026-01-01T12:00:00Z");
    const makeAircraft = (hex: string) => normalizeAircraft(
      { hex, flight: "TEST123", lat: 50, lon: 14 },
      { lat: 50, lon: 14, name: "Test" },
      recordedAt,
    );
    const successful = makeAircraft("ABC123");
    const failed = makeAircraft("DEF456");
    if (!successful || !failed) throw new Error("test aircraft could not be normalized");

    const upsert = vi.fn().mockImplementation(async ({ conflictOn }: { conflictOn: { icaoHex: string } }) => {
      if (conflictOn.icaoHex === "DEF456") throw new Error("simulated aircraft failure");
      return { id: 42 };
    });
    const flightWhere = vi.fn().mockImplementation((filter: Record<string, unknown>) => {
      if ("aircraftId" in filter) {
        return {
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(null) }),
          }),
        };
      }
      if ("id" in filter) return { update: vi.fn().mockResolvedValue(undefined) };
      return { where: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue([]) }) };
    });
    const database = {
      orm: {
        public: {
          Aircraft: { upsert },
          Flight: { where: flightWhere, create: vi.fn().mockResolvedValue({ id: 8 }) },
          FlightPosition: {
            create: vi.fn().mockResolvedValue({ id: 99 }),
            where: vi.fn().mockReturnValue({ delete: vi.fn().mockResolvedValue(undefined) }),
          },
        },
      },
      transaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback(database),
    };
    vi.mocked(getPrisma).mockReturnValue(database as never);

    const result = await recordAircraftSnapshot([successful, failed], recordedAt);

    expect(new Set(result.succeeded)).toEqual(new Set(["ABC123"]));
    expect(new Set(result.failed)).toEqual(new Set(["DEF456"]));
    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it("uses lastSeenAt as the end time after the continuity gap", () => {
    const lastSeenAt = new Date("2026-01-01T12:00:00Z");
    const now = new Date("2026-01-01T12:02:01Z");
    expect(staleFlightEndTime(lastSeenAt, now, 120_000)).toEqual(lastSeenAt);
    expect(staleFlightEndTime(lastSeenAt, new Date("2026-01-01T12:02:00Z"), 120_000)).toBeNull();
  });

  it("returns observation metadata from each RAM history trail point", async () => {
    const aircraft = normalizeAircraft(
      { hex: "ABC123", flight: "TEST123", lat: 50, lon: 14, alt_baro: 18_000, gs: 350, track: 270 },
      { lat: 50, lon: 14, name: "Test" },
      new Date("2026-01-01T12:00:06Z"),
    );
    if (!aircraft) throw new Error("test aircraft could not be normalized");
    const fallback = {
      ...aircraft,
      trail: [
        { lat: 50, lon: 14, recordedAt: "2026-01-01T12:00:00Z", altitude: 8_000, groundSpeed: 250, track: 90 },
        { lat: 50, lon: 14.01, recordedAt: "2026-01-01T12:00:03Z", altitude: 12_000, groundSpeed: 300, track: 180 },
        { lat: 50, lon: 14.02, recordedAt: "2026-01-01T12:00:06Z", altitude: 18_000, groundSpeed: 350, track: 270 },
      ],
    };

    const history = await getAircraftHistory("ABC123", fallback);

    expect(history.source).toBe("memory");
    expect(history.positions.map((position) => position.altitude)).toEqual([8_000, 12_000, 18_000]);
    expect(history.positions.map((position) => position.groundSpeed)).toEqual([250, 300, 350]);
    expect(history.positions.map((position) => position.track)).toEqual([90, 180, 270]);
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
          Aircraft: { upsert: vi.fn().mockResolvedValue({ id: 42 }) },
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
