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
  where(predicate: (fields: Record<string, Record<string, (value: unknown) => boolean>>) => boolean): FakeQuery<T> {
    const filtered = this.rows.filter((row) => predicate(this.fieldsFor(row)));
    return new FakeQuery(filtered);
  }
  include(): FakeQuery<T> { return this; }
  select(): FakeQuery<T> { return this; }
  orderBy(): FakeQuery<T> {
    const sorted = [...this.rows].sort((left, right) => {
      const leftTime = comparable(left.recordedAt ?? left.startTime);
      const rightTime = comparable(right.recordedAt ?? right.startTime);
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
