import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeAircraft } from "@/lib/aircraft/normalize";
import { getPrisma } from "@/lib/server/db";
import { closeStaleFlights, deleteExpiredFlightPositions, getAircraftHistory, recordAircraftSnapshot, staleFlightEndTime } from "@/lib/server/history";

vi.mock("@/lib/server/db", () => ({ getPrisma: vi.fn() }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(getPrisma).mockReset();
});

function emptyFlightPositionStore() {
  const all = vi.fn().mockResolvedValue([]);
  return {
    create: vi.fn().mockResolvedValue({ id: 99 }),
    where: vi.fn().mockReturnValue({
      orderBy: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({ all }),
        }),
      }),
    }),
  };
}

function retentionDatabase(rows: Array<{ id: number; recordedAt: Date }>) {
  let stored = [...rows];
  type RetentionField = { lt: (value: unknown) => boolean; in: (values: unknown[]) => boolean; asc: () => unknown };
  const query = (selected: Array<{ id: number; recordedAt: Date }>) => ({
    where(predicate: (fields: Record<string, RetentionField>) => boolean) {
      const filtered = selected.filter((row) => {
        const fields = new Proxy({}, {
          get: (_target, property: string) => {
            const fieldValue = row[property as keyof typeof row];
            return {
              lt: (value: unknown) => fieldValue instanceof Date
                && fieldValue.getTime() < Number((value as { epochMilliseconds?: number }).epochMilliseconds ?? value),
              in: (values: unknown[]) => values.includes(fieldValue),
              asc: () => undefined,
            };
          },
        }) as Record<string, RetentionField>;
        return predicate(fields);
      });
      return query(filtered);
    },
    orderBy() {
      return query([...selected].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime() || a.id - b.id));
    },
    select() {
      return query(selected);
    },
    limit(value: number) {
      return query(selected.slice(0, value));
    },
    async all() {
      return selected.map(({ id, recordedAt }) => ({ id, recordedAt }));
    },
    async deleteAndCount() {
      const ids = new Set(selected.map((row) => row.id));
      const before = stored.length;
      stored = stored.filter((row) => !ids.has(row.id));
      return before - stored.length;
    },
  });
  const table = {
    where(predicate: (fields: Record<string, RetentionField>) => boolean) {
      return query(stored).where(predicate);
    },
  };
  return {
    database: { orm: { public: { FlightPosition: table } } },
    remaining: () => [...stored],
  };
}

describe("historical flight maintenance", () => {
  it("deletes expired FlightPosition rows in bounded batches and reports backlog", async () => {
    const cutoff = new Date("2026-09-01T00:00:00Z");
    const oldRows = Array.from({ length: 12 }, (_, index) => ({
      id: index + 1,
      recordedAt: new Date(`2026-08-${String(index + 1).padStart(2, "0")}T00:00:00Z`),
    }));
    const currentRows = [
      { id: 100, recordedAt: new Date("2026-09-01T00:00:00Z") },
      { id: 101, recordedAt: new Date("2026-09-02T00:00:00Z") },
    ];
    const store = retentionDatabase([...oldRows, ...currentRows]);

    const first = await deleteExpiredFlightPositions(store.database as never, cutoff, { batchSize: 5, maxBatches: 2 });
    expect(first).toEqual({ deletedRows: 10, batches: 2, backlogRemaining: true });
    expect(store.remaining().map((row) => row.id)).toEqual([11, 12, 100, 101]);

    const second = await deleteExpiredFlightPositions(store.database as never, cutoff, { batchSize: 5, maxBatches: 2 });
    expect(second).toEqual({ deletedRows: 2, batches: 1, backlogRemaining: false });
    expect(store.remaining().map((row) => row.id)).toEqual([100, 101]);
  });

  it("never deletes a current row at the retention cutoff", async () => {
    const cutoff = new Date("2026-09-01T00:00:00Z");
    const store = retentionDatabase([
      { id: 1, recordedAt: new Date("2026-08-31T23:59:59Z") },
      { id: 2, recordedAt: cutoff },
    ]);

    await expect(deleteExpiredFlightPositions(store.database as never, cutoff, { batchSize: 10, maxBatches: 1 }))
      .resolves.toEqual({ deletedRows: 1, batches: 1, backlogRemaining: false });
    expect(store.remaining().map((row) => row.id)).toEqual([2]);
  });

  it("deduplicates aircraft by ICAO hex and retries a concurrent insert conflict", async () => {
    const recordedAt = new Date("2026-01-01T12:00:00Z");
    const aircraft = normalizeAircraft(
      { hex: "ABC123", flight: "TEST123", lat: 50, lon: 14, seen: 0, seen_pos: 8 },
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
          FlightPosition: emptyFlightPositionStore(),
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
    const positionCreate = (database.orm.public.FlightPosition.create as ReturnType<typeof vi.fn>);
    expect(positionCreate).toHaveBeenCalledWith(expect.objectContaining({ recordedAt: expect.objectContaining({ epochMilliseconds: recordedAt.getTime() - 8_000 }) }));
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
          FlightPosition: emptyFlightPositionStore(),
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
          FlightPosition: emptyFlightPositionStore(),
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
