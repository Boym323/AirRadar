import { afterEach, describe, expect, it, vi } from "vitest";
import type { AirportInfrastructure } from "@/lib/airports/infrastructure";
import { getAirportMovements } from "@/lib/server/airport-movements";
import { getPrisma } from "@/lib/server/db";

vi.mock("@/lib/server/db", () => ({ getPrisma: vi.fn() }));

type Row = Record<string, unknown>;

function comparable(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "object" && value !== null && "epochMilliseconds" in value) return Number(value.epochMilliseconds);
  return Number(value);
}

class FakeQuery<T extends Row> {
  constructor(private readonly rows: T[]) {}
  private fieldsFor(row: T): Record<string, Record<string, (value: unknown) => boolean>> {
    return new Proxy({}, {
      get: (_target, field: string) => new Proxy({}, {
        get: (_nested, operation: string) => (value: unknown) => {
          const rowValue = row[field];
          if (operation === "in") return Array.isArray(value) && value.includes(rowValue);
          if (operation === "gte") return comparable(rowValue) >= comparable(value);
          if (operation === "lte") return comparable(rowValue) <= comparable(value);
          if (operation === "lt") return comparable(rowValue) < comparable(value);
          return true;
        },
      }),
    }) as Record<string, Record<string, (value: unknown) => boolean>>;
  }
  where(predicate: ((fields: Record<string, Record<string, (value: unknown) => boolean>>) => boolean) | Record<string, unknown>): FakeQuery<T> {
    const filtered = this.rows.filter((row) => {
      if (typeof predicate === "function") return predicate(this.fieldsFor(row));
      return Object.entries(predicate).every(([field, expected]) => {
        const actual = row[field];
        if (expected && typeof expected === "object") {
          const conditions = expected as Record<string, unknown>;
          return Object.entries(conditions).every(([op, value]) =>
            op === "in" ? Array.isArray(value) && value.includes(actual) :
              op === "gte" ? comparable(actual) >= comparable(value) :
                op === "lt" ? comparable(actual) < comparable(value) : false);
        }
        return actual === expected;
      });
    });
    return new FakeQuery(filtered);
  }
  include(): FakeQuery<T> { return this; }
  select(): FakeQuery<T> { return this; }
  orderBy(): FakeQuery<T> {
    const sorted = [...this.rows].sort((left, right) => {
      const leftTime = comparable(left.recordedAt ?? left.occurredAt ?? left.startTime);
      const rightTime = comparable(right.recordedAt ?? right.occurredAt ?? right.startTime);
      return rightTime - leftTime || Number(right.id ?? right.flightId ?? 0) - Number(left.id ?? left.flightId ?? 0);
    });
    return new FakeQuery(sorted);
  }
  limit(value: number): FakeQuery<T> { return new FakeQuery(this.rows.slice(0, value)); }
  async all(): Promise<T[]> { return this.rows; }
}

const airport = { icaoCode: "LKPR", iataCode: "PRG", name: "Prague", city: "Prague", country: "Czechia", latitude: 50, longitude: 14, elevationFt: 1_200 };
const infrastructure: AirportInfrastructure = { runways: [], frequencies: [], navaids: [] };

afterEach(() => vi.mocked(getPrisma).mockReset());

describe("airport movement query bounds", () => {
  it("reports an incomplete lower-bound result when the spatial flight-id sentinel is reached", async () => {
    const flights = Array.from({ length: 251 }, (_, id) => ({
      id: id + 1,
      callsign: `TEST${id}`,
      registration: null,
      startTime: new Date("2026-09-12T08:00:00Z"),
      aircraft: { icaoHex: `${(id + 1).toString(16).padStart(6, "0")}`, registration: null },
    }));
    const positions = flights.map((flight, index) => ({
      id: index + 1,
      flightId: flight.id,
      recordedAt: new Date("2026-09-12T10:00:00Z"),
      lat: 50,
      lon: 14,
      altitude: 10_000,
      groundSpeed: 300,
      track: 90,
      verticalRate: 0,
    }));
    vi.mocked(getPrisma).mockReturnValue({ orm: { public: {
      Flight: new FakeQuery(flights),
      FlightPosition: new FakeQuery(positions),
    } } } as never);

    const result = await getAirportMovements(airport, infrastructure, { now: new Date("2026-09-12T12:00:00Z") });
    expect(result).toMatchObject({ complete: false, truncated: true, diagnostics: { flightsExamined: 250, positionsExamined: 251 } });
    expect(result.movements).toEqual([]);
  });

  it("filters canonical exception events by requested period and kind in the query", async () => {
    const flight = {id: 1, callsign: "TEST1", registration: null,
      aircraft: {icaoHex: "ABC001", registration: null}};
    const positions = [{id: 1, flightId: 1, recordedAt: new Date("2026-09-12T10:00:00Z"),
      lat: 50, lon: 14, altitude: 2_000, groundSpeed: 220, track: 180, verticalRate: -700}];
    const events = [
      {flightId: 1, type: "GO_AROUND", airportIcao: "LKPR", occurredAt: new Date("2026-09-12T11:50:00Z")},
      {flightId: 1, type: "HOLDING", airportIcao: "LKPR", occurredAt: new Date("2026-09-09T11:00:00Z")},
      {flightId: 1, type: "LANDING", airportIcao: "LKPR", occurredAt: new Date("2026-09-12T11:30:00Z")},
      {flightId: 1, type: "GO_AROUND", airportIcao: "LKPR", occurredAt: new Date("2026-09-13T11:00:00Z")},
    ];
    vi.mocked(getPrisma).mockReturnValue({orm: {public: {
      Flight: new FakeQuery([flight]), FlightPosition: new FakeQuery(positions),
      FlightEvent: new FakeQuery(events),
    }}} as never);
    const result = await getAirportMovements(airport, infrastructure, {
      period: "24h", now: new Date("2026-09-12T12:00:00Z"),
    });
    expect(result.eventEvidence?.map(item => item.movement)).toEqual(["GO_AROUND"]);
    expect(result.eventEvidenceTruncated).toBe(false);
    expect(result.complete).toBe(true);
  });

  it("applies all four geographic envelope limits before selecting flight IDs", async () => {
    const flights = [{ id: 1, callsign: "INSIDE", registration: null, startTime: new Date("2026-09-12T08:00:00Z"), aircraft: { icaoHex: "ABC001", registration: null } }];
    const positions = [
      { id: 1, flightId: 1, recordedAt: new Date("2026-09-12T10:00:00Z"), lat: 50, lon: 14, altitude: 10_000, groundSpeed: 300, track: 90, verticalRate: 0 },
      { id: 2, flightId: 2, recordedAt: new Date("2026-09-12T10:00:00Z"), lat: 50.5, lon: 14, altitude: 10_000, groundSpeed: 300, track: 90, verticalRate: 0 },
      { id: 3, flightId: 3, recordedAt: new Date("2026-09-12T10:00:00Z"), lat: 49.5, lon: 14, altitude: 10_000, groundSpeed: 300, track: 90, verticalRate: 0 },
      { id: 4, flightId: 4, recordedAt: new Date("2026-09-12T10:00:00Z"), lat: 50, lon: 14.7, altitude: 10_000, groundSpeed: 300, track: 90, verticalRate: 0 },
      { id: 5, flightId: 5, recordedAt: new Date("2026-09-12T10:00:00Z"), lat: 50, lon: 13.3, altitude: 10_000, groundSpeed: 300, track: 90, verticalRate: 0 },
    ];
    vi.mocked(getPrisma).mockReturnValue({ orm: { public: { Flight: new FakeQuery(flights), FlightPosition: new FakeQuery(positions) } } } as never);
    const result = await getAirportMovements(airport, infrastructure, { now: new Date("2026-09-12T12:00:00Z") });
    expect(result.diagnostics.flightsExamined).toBe(1);
  });
});
