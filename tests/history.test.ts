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
  it("reuses normalized aircraft without modifying caller data or duplicate semantics", async () => {
    vi.mocked(getPrisma).mockReturnValue(null as never);
    const at = new Date("2026-10-16T09:00:00Z");
    const normalized = normalizeAircraft(
      { hex: "ABC123", flight: "TEST123", lat: 50, lon: 14 },
      { lat: 50, lon: 14, name: "Test" }, at,
    );
    if (!normalized) throw new Error("missing normalized aircraft");
    Object.freeze(normalized);
    const lower = { ...normalized, icaoHex: "abc123" };
    const different = { ...normalized, icaoHex: "DEF456" };
    const result = await recordAircraftSnapshot([normalized, lower, different], at);
    expect(result).toEqual({ succeeded: ["ABC123", "DEF456"], failed: [] });
    expect(lower.icaoHex).toBe("abc123");
    expect(normalized.icaoHex).toBe("ABC123");
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
    const flightPositionWhere = vi.fn().mockImplementation(() => ({
      orderBy: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue([]) }),
        }),
      }),
      deleteAndCount: vi.fn().mockResolvedValue(0),
    }));
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
            where: flightPositionWhere,
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
    const positionCreate = (database.orm.public.FlightPosition.create as ReturnType<typeof vi.fn>);
    expect(positionCreate).toHaveBeenCalledWith(expect.objectContaining({ recordedAt: expect.objectContaining({ epochMilliseconds: recordedAt.getTime() - 8_000 }) }));
    expect(transactionAttempts).toBe(2);
  });

  it("avoids redundant prior-flight SQL when an open durable Flight already exists", async () => {
    const recordedAt = new Date("2026-01-01T12:00:20Z");
    const aircraft = normalizeAircraft(
      { hex: "DEF889", flight: "ACTIVE1", lat: 50, lon: 14, seen: 0, seen_pos: 0 },
      { lat: 50, lon: 14, name: "Test" },
      recordedAt,
    );
    if (!aircraft) throw new Error("test aircraft could not be normalized");

    const priorFlightsLimit = vi.fn(() => ({ all: vi.fn().mockResolvedValue([{ id: 10 }]) }));
    const openFlight = {
      id: 10, callsign: "ACTIVE1", lastSeenAt: Temporal.Instant.fromEpochMilliseconds(recordedAt.getTime() - 10_000),
      endTime: null, maxAltitude: null, minDistanceKm: null, destination: null,
    };
    const updateFlight = vi.fn().mockResolvedValue(openFlight);
    const flightWhere = vi.fn((filter: Record<string, unknown>) => {
      if ("aircraftId" in filter) return {
        limit: priorFlightsLimit,
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(openFlight) }),
        }),
      };
      return { update: updateFlight };
    });
    const positionCreate = vi.fn().mockResolvedValue({ id: 101 });
    const database = {
      orm: {
        public: {
          Aircraft: {
            where: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue({ id: 987654321, registration: null, aircraftType: null }),
              update: vi.fn().mockResolvedValue({ id: 987654321 }),
            }),
          },
          Flight: { where: flightWhere, create: vi.fn() },
          FlightPosition: {
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(null) }),
            }),
            create: positionCreate,
          },
        },
      },
      transaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback(database),
    };
    vi.mocked(getPrisma).mockReturnValue(database as never);
    const result = await recordAircraftSnapshot([aircraft], recordedAt);
    expect(result.failed).toEqual([]);
    expect(result.succeeded).toEqual(["DEF889"]);
    expect(priorFlightsLimit).not.toHaveBeenCalled();
    expect(updateFlight).toHaveBeenCalledTimes(1);
    expect(positionCreate).toHaveBeenCalledTimes(1);
  });

  it("caches durable identity, open flight and last position between samples", async () => {
    const firstAt = new Date("2026-01-01T12:00:00Z");
    const secondAt = new Date("2026-01-01T12:00:20Z");
    const aircraft = normalizeAircraft(
      { hex: "CA1CED", flight: "CACHE1", lat: 50, lon: 14, seen: 0, seen_pos: 0 },
      { lat: 50, lon: 14, name: "Test" },
      firstAt,
    );
    if (!aircraft) throw new Error("test aircraft could not be normalized");

    const aircraftLookup = vi.fn().mockResolvedValue({
      id: 123, registration: null, registrationCountry: null, registrationCountryCode: null,
      aircraftType: null, manufacturer: null, model: null, operator: null,
    });
    const openFlight = {
      id: 456, aircraftId: 123, callsign: "CACHE1", registration: null, aircraftType: null,
      airline: null, origin: null, destination: null, destinationProvenanceJson: null,
      maxAltitude: null, minDistanceKm: null,
      startTime: Temporal.Instant.fromEpochMilliseconds(firstAt.getTime()),
      lastSeenAt: Temporal.Instant.fromEpochMilliseconds(firstAt.getTime() - 10_000),
      endTime: null,
    };
    const flightLookup = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(openFlight) }),
      }),
    });
    const positionLookup = vi.fn().mockReturnValue({
      orderBy: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(null) }),
    });
    const flightUpdate = vi.fn().mockResolvedValue(undefined);
    const positionCreate = vi.fn().mockResolvedValue({ id: 789 });
    const database = {
      orm: {
        public: {
          Aircraft: {
            where: vi.fn().mockReturnValue({ first: aircraftLookup }),
            update: vi.fn().mockResolvedValue(undefined),
          },
          Flight: {
            where: vi.fn((filter: Record<string, unknown>) => "aircraftId" in filter
              ? flightLookup()
              : { update: flightUpdate }),
            create: vi.fn(),
          },
          FlightPosition: { where: positionLookup, create: positionCreate },
        },
      },
      transaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback(database),
    };
    vi.mocked(getPrisma).mockReturnValue(database as never);

    const first = await recordAircraftSnapshot([aircraft], firstAt);
    const second = await recordAircraftSnapshot([{ ...aircraft, lastSeen: secondAt.toISOString(), lat: 50.01, lon: 14.01 }], secondAt);

    expect(first.failed).toEqual([]);
    expect(second.failed).toEqual([]);
    expect(aircraftLookup).toHaveBeenCalledTimes(1);
    expect(flightLookup).toHaveBeenCalledTimes(1);
    expect(positionLookup).toHaveBeenCalledTimes(1);
    expect(flightUpdate).toHaveBeenCalledTimes(2);
    expect(positionCreate).toHaveBeenCalledTimes(2);
  });

  it("does not reuse history cache rows after a database client restart", async () => {
    const recordedAt = new Date("2026-01-01T12:00:00Z");
    const aircraft = normalizeAircraft(
      { hex: "E5A101", flight: "RESTART1", lat: 50, lon: 14, seen: 0, seen_pos: 0 },
      { lat: 50, lon: 14, name: "Test" },
      recordedAt,
    );
    if (!aircraft) throw new Error("test aircraft could not be normalized");

    const makeDatabase = (aircraftId: number, flightId: number) => {
      const aircraftLookup = vi.fn().mockResolvedValue({
        id: aircraftId, registration: null, registrationCountry: null, registrationCountryCode: null,
        aircraftType: null, manufacturer: null, model: null, operator: null,
      });
      const flightCreate = vi.fn().mockImplementation(async (input: Record<string, unknown>) => ({ ...input, id: flightId }));
      const positionCreate = vi.fn().mockResolvedValue({ id: flightId + 100 });
      const flightWhere = vi.fn((filter: Record<string, unknown>) => {
        if ("aircraftId" in filter) return {
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(null) }),
          }),
          limit: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue([]) }),
        };
        return { update: vi.fn() };
      });
      const database = {
        orm: {
          public: {
            Aircraft: { where: vi.fn().mockReturnValue({ first: aircraftLookup }) },
            Flight: { where: flightWhere, create: flightCreate },
            FlightPosition: { create: positionCreate },
          },
        },
        transaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback(database),
      };
      return { database, aircraftLookup, flightCreate };
    };

    const first = makeDatabase(701, 801);
    vi.mocked(getPrisma).mockReturnValue(first.database as never);
    expect((await recordAircraftSnapshot([aircraft], recordedAt)).failed).toEqual([]);

    const restarted = makeDatabase(702, 802);
    vi.mocked(getPrisma).mockReturnValue(restarted.database as never);
    expect((await recordAircraftSnapshot([aircraft], recordedAt)).failed).toEqual([]);

    expect(first.aircraftLookup).toHaveBeenCalledTimes(1);
    expect(restarted.aircraftLookup).toHaveBeenCalledTimes(1);
    expect(first.flightCreate).toHaveBeenCalledTimes(1);
    expect(restarted.flightCreate).toHaveBeenCalledTimes(1);
  });

  it("groups warm steady-state aircraft and falls back when the batch transaction fails", async () => {
    const firstAt = new Date("2026-01-01T12:00:00Z");
    const secondAt = new Date("2026-01-01T12:00:20Z");
    const items = ["CA1CE1", "CA1CE2", "CA1CE3", "CA1CE4"].map((hex, index) => {
      const value = normalizeAircraft(
        { hex, flight: `CACHE${index}`, lat: 50, lon: 14 + index / 100, seen: 0, seen_pos: 0 },
        { lat: 50, lon: 14, name: "Test" },
        firstAt,
      );
      if (!value) throw new Error("test aircraft could not be normalized");
      return value;
    });
    const aircraftRows = new Map<string, Record<string, unknown>>();
    const flights = new Map<number, Record<string, unknown>>();
    let nextAircraftId = 100;
    let nextFlightId = 200;
    let transactions = 0;
    let failNextBatch = false;
    const aircraftWhere = vi.fn((filter: { icaoHex: string }) => ({ first: vi.fn().mockResolvedValue(aircraftRows.get(filter.icaoHex) ?? null) }));
    const aircraftCreate = vi.fn(async (input: Record<string, unknown>) => {
      const row = { ...input, id: nextAircraftId++ };
      aircraftRows.set(String(input.icaoHex), row);
      return row;
    });
    const flightWhere = vi.fn((filter: Record<string, unknown>) => {
      if ("aircraftId" in filter) {
        const aircraftId = Number(filter.aircraftId);
        const open = flights.get(aircraftId) ?? null;
        return {
          limit: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue(open ? [open] : []) }),
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(open) }),
          }),
        };
      }
      if ("id" in filter) {
        return { update: vi.fn(async (values: Record<string, unknown>) => Object.assign(flights.get(Number(filter.id)) ?? {}, values)) };
      }
      return { where: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue([]) }) };
    });
    const flightCreate = vi.fn(async (input: Record<string, unknown>) => {
      const row = { ...input, id: nextFlightId++ };
      flights.set(Number(input.aircraftId), row);
      return row;
    });
    const positionWhere = vi.fn(() => ({
      orderBy: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(null) }),
      limit: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue([]) }) }),
      deleteAndCount: vi.fn().mockResolvedValue(0),
    }));
    const positionCreate = vi.fn().mockResolvedValue({ id: 300 });
    const database = {
      orm: {
        public: {
          Aircraft: { where: aircraftWhere, create: aircraftCreate },
          Flight: { where: flightWhere, create: flightCreate },
          FlightPosition: { where: positionWhere, create: positionCreate },
        },
      },
      transaction: async (callback: (transaction: unknown) => Promise<unknown>) => {
        transactions += 1;
        if (failNextBatch && transactions === items.length + 2) {
          failNextBatch = false;
          throw new Error("simulated batch failure");
        }
        return callback(database);
      },
    };
    vi.mocked(getPrisma).mockReturnValue(database as never);

    const initial = await recordAircraftSnapshot(items, firstAt);
    const warm = await recordAircraftSnapshot(items.map((item, index) => ({
      ...item,
      lastSeen: secondAt.toISOString(),
      lat: 50.01,
      lon: 14 + index / 100 + 0.01,
    })), secondAt);
    expect(initial.failed).toEqual([]);
    expect(warm.failed).toEqual([]);
    expect(transactions).toBe(items.length + 1);
    expect(positionCreate).toHaveBeenCalledTimes(items.length * 2);

    failNextBatch = true;
    const fallback = await recordAircraftSnapshot(items.map((item, index) => ({
      ...item,
      lastSeen: new Date(secondAt.getTime() + 20_000).toISOString(),
      lat: 50.02,
      lon: 14 + index / 100 + 0.02,
    })), new Date(secondAt.getTime() + 20_000));
    expect(fallback.failed).toEqual([]);
    expect(transactions).toBe(items.length + 6);
    expect(positionCreate).toHaveBeenCalledTimes(items.length * 3);
  });

  it("keeps existing Flight and FlightPosition timestamp inputs temporal", async () => {
    const recordedAt = new Date("2026-01-01T12:00:10Z");
    const previousSeenAt = Temporal.Instant.fromEpochMilliseconds(new Date("2026-01-01T12:00:00Z").getTime());
    const aircraft = normalizeAircraft(
      { hex: "ABC123", flight: "TEST123", lat: 50, lon: 14, seen: 0, seen_pos: 0 },
      { lat: 50, lon: 14, name: "Test" },
      recordedAt,
    );
    if (!aircraft) throw new Error("test aircraft could not be normalized");

    const flightUpdate = vi.fn().mockResolvedValue(undefined);
    const positionCreate = vi.fn().mockResolvedValue({ id: 99 });
    const openFlight = {
      id: 8,
      callsign: "TEST123",
      registration: "OK-ABC",
      aircraftType: "A320",
      airline: null,
      origin: null,
      destination: null,
      maxAltitude: 10_000,
      minDistanceKm: 100,
      lastSeenAt: previousSeenAt,
      endTime: null,
    };
    const flightWhere = vi.fn((filter: Record<string, unknown>) => {
      if ("aircraftId" in filter) {
        return {
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(openFlight) }),
          }),
        };
      }
      if ("id" in filter) return { update: flightUpdate };
      return { where: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue([]) }) };
    });
    const database = {
      orm: {
        public: {
          Aircraft: {
            where: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue({
              id: 42,
              registration: null,
              registrationCountry: null,
              registrationCountryCode: null,
              aircraftType: null,
              manufacturer: null,
              model: null,
              operator: null,
            }), update: vi.fn().mockResolvedValue(undefined) }),
          },
          Flight: { where: flightWhere, create: vi.fn() },
          FlightPosition: {
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(null),
                limit: vi.fn().mockReturnValue({
                  select: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue([]) }),
                  all: vi.fn().mockResolvedValue([]),
                }),
              }),
            }),
            create: positionCreate,
          },
        },
      },
      transaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback(database),
    };
    vi.mocked(getPrisma).mockReturnValue(database as never);

    const result = await recordAircraftSnapshot([aircraft], recordedAt);

    expect(result.failed).toEqual([]);
    expect(flightUpdate).toHaveBeenCalledWith(expect.objectContaining({
      lastSeenAt: expect.objectContaining({ epochMilliseconds: recordedAt.getTime() }),
    }));
    expect((flightUpdate.mock.calls[0]?.[0] as { lastSeenAt: Temporal.Instant }).lastSeenAt).toBeInstanceOf(Temporal.Instant);
    expect(positionCreate).toHaveBeenCalledWith(expect.objectContaining({
      recordedAt: expect.objectContaining({ epochMilliseconds: recordedAt.getTime() }),
    }));
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
