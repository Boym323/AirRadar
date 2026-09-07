import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as getFlight } from "@/app/api/history/flights/[id]/route";
import {
  getHistoryFlight,
  HISTORY_POSITION_LIMIT,
  listHistoryFlights,
} from "@/lib/server/history";
import { getPrisma } from "@/lib/server/db";
import { playbackSampleAt, playbackTimeRange, type PlaybackPosition } from "@/lib/history/playback";

vi.mock("@/lib/server/db", () => ({ getPrisma: vi.fn() }));

type Row = Record<string, unknown>;

function comparable(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "object" && value !== null && "epochMilliseconds" in value) return Number(value.epochMilliseconds);
  return Number(value);
}

function matchesLike(value: unknown, pattern: string): boolean {
  if (typeof value !== "string") return false;
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*");
  return new RegExp(`^${escaped}$`, "i").test(value);
}

class FakeCollection {
  constructor(
    private readonly rows: Row[],
    private readonly kind: "Aircraft" | "Flight" | "FlightPosition",
    private readonly onAll?: () => void,
    private readonly onIn?: () => void,
  ) {}

  private fieldsFor(row: Row): Row {
    return new Proxy({}, {
      get: (_target, property: string) => {
        if (property === "aircraft") {
          return {
            some: (predicate: (fields: Row) => boolean) => predicate(this.fieldsFor((row.aircraft ?? {}) as Row)),
          };
        }
        return {
          ilike: (pattern: string) => matchesLike(row[property], pattern),
          in: (values: unknown[]) => {
            this.onIn?.();
            return values.includes(row[property]);
          },
          gte: (value: unknown) => comparable(row[property]) >= comparable(value),
          lt: (value: unknown) => comparable(row[property]) < comparable(value),
          asc: () => undefined,
          desc: () => undefined,
        };
      },
    });
  }

  where(filter: Row | ((fields: Row) => boolean)): FakeCollection {
    const filtered = typeof filter === "function"
      ? this.rows.filter((row) => filter(this.fieldsFor(row)))
      : this.rows.filter((row) => Object.entries(filter).every(([key, value]) => row[key] === value));
    return new FakeCollection(filtered, this.kind, this.onAll, this.onIn);
  }

  select(...fields: string[]): FakeCollection {
    return new FakeCollection(this.rows.map((row) => Object.fromEntries(fields.map((field) => [field, row[field]]))), this.kind, this.onAll, this.onIn);
  }

  include(): FakeCollection {
    return this;
  }

  orderBy(): FakeCollection {
    const sorted = [...this.rows].sort((a, b) => {
      if (this.kind === "FlightPosition") return comparable(a.recordedAt) - comparable(b.recordedAt);
      if (this.kind === "Flight") return comparable(b.startTime) - comparable(a.startTime) || Number(b.id) - Number(a.id);
      return 0;
    });
    return new FakeCollection(sorted, this.kind, this.onAll, this.onIn);
  }

  limit(value: number): FakeCollection {
    return new FakeCollection(this.rows.slice(0, value), this.kind, this.onAll, this.onIn);
  }

  async all(): Promise<Row[]> {
    this.onAll?.();
    return this.rows;
  }

  async first(): Promise<Row | null> {
    return this.rows[0] ?? null;
  }
}

function fakeDatabase({ aircraft, flights, positions = [], onAircraftAll, onIn }: { aircraft: Row[]; flights: Row[]; positions?: Row[]; onAircraftAll?: () => void; onIn?: () => void }) {
  return {
    orm: {
      public: {
        Aircraft: new FakeCollection(aircraft, "Aircraft", onAircraftAll, onIn),
        Flight: new FakeCollection(flights, "Flight", undefined, onIn),
        FlightPosition: new FakeCollection(positions, "FlightPosition"),
      },
    },
  };
}

function flight(id: number, startTime: string, callsign: string, aircraftId = 1): Row {
  return {
    id,
    aircraftId,
    callsign,
    registration: null,
    aircraftType: "A320",
    airline: "Test Air",
    origin: "PRG",
    destination: "DXB",
    maxAltitude: 20_000,
    minDistanceKm: 10,
    startTime: new Date(startTime),
    lastSeenAt: new Date(startTime),
    endTime: null,
    aircraft: { icaoHex: aircraftId === 1 ? "ABC123" : "DEF456", registration: aircraftId === 1 ? "OK-ABC" : "N-DEF", aircraftType: "A320" },
  };
}

const aircraft = [
  { id: 1, icaoHex: "ABC123", registration: "OK-ABC", aircraftType: "A320" },
  { id: 2, icaoHex: "DEF456", registration: "N-DEF", aircraftType: "PC12" },
];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(getPrisma).mockReset();
});

describe("flight history v2", () => {
  it("lists flights newest-first", async () => {
    vi.mocked(getPrisma).mockReturnValue(fakeDatabase({ aircraft, flights: [flight(1, "2026-09-05T10:00:00Z", "OLD"), flight(2, "2026-09-07T10:00:00Z", "NEW", 2)] }) as never);
    const result = await listHistoryFlights({ range: "7d", now: new Date("2026-09-07T12:00:00Z") });
    expect(result.flights.map((item) => item.id)).toEqual([2, 1]);
  });

  it("filters today using Europe/Prague calendar boundaries", async () => {
    vi.stubEnv("APP_TIMEZONE", "Europe/Prague");
    vi.mocked(getPrisma).mockReturnValue(fakeDatabase({
      aircraft,
      flights: [
        flight(1, "2026-01-01T22:30:00Z", "LOCAL-1"),
        flight(2, "2026-01-01T23:30:00Z", "LOCAL-2", 2),
      ],
    }) as never);
    const result = await listHistoryFlights({ range: "today", now: new Date("2026-01-02T00:30:00Z") });
    expect(result.flights.map((item) => item.callsign)).toEqual(["LOCAL-2"]);
  });

  it("searches by callsign", async () => {
    vi.mocked(getPrisma).mockReturnValue(fakeDatabase({ aircraft, flights: [flight(1, "2026-09-07T10:00:00Z", "UAE139"), flight(2, "2026-09-07T09:00:00Z", "CSA001", 2)] }) as never);
    const result = await listHistoryFlights({ query: "uae139", now: new Date("2026-09-07T12:00:00Z") });
    expect(result.flights.map((item) => item.callsign)).toEqual(["UAE139"]);
  });

  it("searches by registration", async () => {
    vi.mocked(getPrisma).mockReturnValue(fakeDatabase({ aircraft, flights: [flight(1, "2026-09-07T10:00:00Z", "UAE139"), flight(2, "2026-09-07T09:00:00Z", "CSA001", 2)] }) as never);
    const result = await listHistoryFlights({ query: "n-def", now: new Date("2026-09-07T12:00:00Z") });
    expect(result.flights.map((item) => item.icaoHex)).toEqual(["DEF456"]);
  });

  it("searches a historical flight registration", async () => {
    const historical = { ...flight(1, "2026-09-07T10:00:00Z", "UAE139"), registration: "HIST-REG" };
    vi.mocked(getPrisma).mockReturnValue(fakeDatabase({ aircraft, flights: [historical, flight(2, "2026-09-07T09:00:00Z", "CSA001", 2)] }) as never);
    const result = await listHistoryFlights({ query: "hist-reg", now: new Date("2026-09-07T12:00:00Z") });
    expect(result.flights.map((item) => item.id)).toEqual([1]);
  });

  it("searches by ICAO hex", async () => {
    vi.mocked(getPrisma).mockReturnValue(fakeDatabase({ aircraft, flights: [flight(1, "2026-09-07T10:00:00Z", "UAE139"), flight(2, "2026-09-07T09:00:00Z", "CSA001", 2)] }) as never);
    const result = await listHistoryFlights({ query: "def456", now: new Date("2026-09-07T12:00:00Z") });
    expect(result.flights.map((item) => item.icaoHex)).toEqual(["DEF456"]);
  });

  it("keeps fuzzy search relational and bounded without materializing Aircraft ids", async () => {
    const aircraftAll = vi.fn(() => { throw new Error("Aircraft.all() must not be used for fuzzy search"); });
    const inCalls = vi.fn();
    const largeAircraft = Array.from({ length: 10_000 }, (_, index) => ({
      id: index + 1,
      icaoHex: index === 0 ? "ABC123" : index.toString(16).padStart(6, "0").slice(-6).toUpperCase(),
      registration: index === 0 ? "OK-ABC" : `N-${index}`,
      aircraftType: "A320",
    }));
    const flights = Array.from({ length: 150 }, (_, index) => flight(index + 1, `2026-09-07T${String(10 + Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}:00Z`, `AIR-${index + 1}`));
    vi.mocked(getPrisma).mockReturnValue(fakeDatabase({ aircraft: largeAircraft, flights, onAircraftAll: aircraftAll, onIn: inCalls }) as never);
    const result = await listHistoryFlights({ query: "air", limit: 500, now: new Date("2026-09-07T23:00:00Z") });
    expect(result.limit).toBe(100);
    expect(result.flights).toHaveLength(100);
    expect(aircraftAll).not.toHaveBeenCalled();
    expect(inCalls).not.toHaveBeenCalled();
  });

  it("treats an empty search as the normal bounded range query", async () => {
    vi.mocked(getPrisma).mockReturnValue(fakeDatabase({ aircraft, flights: [flight(1, "2026-09-07T10:00:00Z", "ONE"), flight(2, "2026-09-07T09:00:00Z", "TWO", 2)] }) as never);
    const result = await listHistoryFlights({ query: " %% ", now: new Date("2026-09-07T12:00:00Z") });
    expect(result.flights.map((item) => item.id)).toEqual([1, 2]);
  });

  it("returns 400 for an invalid flight id", async () => {
    const response = await getFlight(new Request("http://localhost/api/history/flights/nope"), { params: Promise.resolve({ id: "nope" }) });
    expect(response.status).toBe(400);
  });

  it("returns 404 for an unknown flight", async () => {
    vi.mocked(getPrisma).mockReturnValue(fakeDatabase({ aircraft, flights: [] }) as never);
    const response = await getFlight(new Request("http://localhost/api/history/flights/999"), { params: Promise.resolve({ id: "999" }) });
    expect(response.status).toBe(404);
  });

  it("returns detail positions chronologically and reports truncation", async () => {
    const positions = Array.from({ length: HISTORY_POSITION_LIMIT + 1 }, (_, index) => ({
      id: index,
      flightId: 1,
      recordedAt: new Date(Date.UTC(2026, 0, 1, 12, 0, index)),
      lat: 50 + index / 1000,
      lon: 14,
      altitude: 10_000,
      groundSpeed: 250,
      track: 90,
      verticalRate: null,
    })).reverse();
    vi.mocked(getPrisma).mockReturnValue(fakeDatabase({ aircraft, flights: [flight(1, "2026-01-01T12:00:00Z", "TEST")], positions }) as never);
    const result = await getHistoryFlight(1);
    expect(result?.positions).toHaveLength(HISTORY_POSITION_LIMIT);
    expect(result?.truncated).toBe(true);
    const firstRecordedAt = result?.positions[0]?.recordedAt;
    const lastRecordedAt = result?.positions.at(-1)?.recordedAt;
    expect(firstRecordedAt !== undefined && lastRecordedAt !== undefined && firstRecordedAt < lastRecordedAt).toBe(true);
  });

  it("resolves a hex deep-link to the latest flight instance", async () => {
    vi.mocked(getPrisma).mockReturnValue(fakeDatabase({
      aircraft,
      flights: [flight(1, "2026-09-01T10:00:00Z", "OLD"), flight(2, "2026-09-07T10:00:00Z", "NEW")],
    }) as never);
    const result = await listHistoryFlights({ icaoHex: "abc123", limit: 1 });
    expect(result.flights[0]?.callsign).toBe("NEW");
  });

  it("keeps playback at the first and last observation at the boundaries", () => {
    const positions: PlaybackPosition[] = [
      { recordedAt: "2026-01-01T12:00:00Z", lat: 50, lon: 14, altitude: 8_000, groundSpeed: 200, track: 90 },
      { recordedAt: "2026-01-01T12:01:00Z", lat: 51, lon: 15, altitude: 10_000, groundSpeed: 220, track: 100 },
    ];
    const range = playbackTimeRange(positions);
    expect(range).toEqual({ start: Date.parse(positions[0].recordedAt), end: Date.parse(positions[1].recordedAt) });
    expect(playbackSampleAt(positions, range!.start)).toMatchObject({ lat: 50, lon: 14, index: 0 });
    expect(playbackSampleAt(positions, range!.end)).toMatchObject({ lat: 51, lon: 15, index: 1 });
    expect(playbackSampleAt(positions, range!.start + 30_000)).toMatchObject({ lat: 50.5, lon: 14.5 });
  });
});
