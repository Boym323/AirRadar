import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as getAirportTraffic } from "@/app/api/airports/[icao]/traffic/route";
import type { Airport } from "@/lib/airports/types";
import { aircraftAirportHref, aircraftFlightHref, aircraftHistoryHref } from "@/lib/aircraft/detail-links";
import { getTranslations } from "@/lib/i18n";
import {
  AIRPORT_TRAFFIC_RECENT_LIMIT,
  AIRPORT_TRAFFIC_TOP_LIMIT,
  airportTrafficRangeBounds,
  getAirportTrafficSummary,
} from "@/lib/server/airport-traffic";
import { getPrisma } from "@/lib/server/db";
import { resolveAirportDetail } from "@/lib/server/airport-detail";

vi.mock("@/lib/server/db", () => ({ getPrisma: vi.fn() }));
vi.mock("@/lib/server/airport-detail", () => ({ resolveAirportDetail: vi.fn() }));

type Row = Record<string, unknown>;

function comparable(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "object" && value !== null && "epochMilliseconds" in value) return Number(value.epochMilliseconds);
  return Number(value);
}

class FakeCollection {
  constructor(
    private readonly rows: Row[],
    private readonly kind: "Flight" | "Airport",
    private readonly onAll: () => void,
    private readonly onIn: () => void,
  ) {}

  private fieldsFor(row: Row): Row {
    return new Proxy({}, {
      get: (_target, property: string) => ({
        in: (values: unknown[]) => {
          this.onIn();
          return values.includes(row[property]);
        },
        gte: (value: unknown) => comparable(row[property]) >= comparable(value),
        lt: (value: unknown) => comparable(row[property]) < comparable(value),
      }),
    });
  }

  where(filter: Row | ((fields: Row) => boolean)): FakeCollection {
    const filtered = typeof filter === "function"
      ? this.rows.filter((row) => filter(this.fieldsFor(row)))
      : this.rows.filter((row) => Object.entries(filter).every(([key, value]) => row[key] === value));
    return new FakeCollection(filtered, this.kind, this.onAll, this.onIn);
  }

  include(): FakeCollection {
    return this;
  }

  select(): FakeCollection {
    return this;
  }

  async all(): Promise<Row[]> {
    this.onAll();
    return this.rows;
  }
}

function fakeDatabase(flights: Row[], airports: Row[], counters: { all: number; in: number }) {
  const onAll = () => { counters.all += 1; };
  const onIn = () => { counters.in += 1; };
  return {
    orm: {
      public: {
        Flight: new FakeCollection(flights, "Flight", onAll, onIn),
        Airport: new FakeCollection(airports, "Airport", onAll, onIn),
      },
    },
  };
}

const prague: Airport = {
  icaoCode: "LKPR",
  iataCode: "PRG",
  name: "Václav Havel Airport Prague",
  city: "Prague",
  country: "Czechia",
  latitude: 50.1,
  longitude: 14.3,
};

const routeAirports = [
  { icao: "LKPR", iata: "PRG", latitude: 50.1, longitude: 14.3 },
  { icao: "EDDF", iata: "FRA", latitude: 50.0, longitude: 8.6 },
  { icao: "EHAM", iata: "AMS", latitude: 52.3, longitude: 4.8 },
  { icao: "EGLL", iata: "LHR", latitude: 51.5, longitude: -0.5 },
  { icao: "LOWW", iata: "VIE", latitude: 48.1, longitude: 16.6 },
  { icao: "EPWA", iata: "WAW", latitude: 52.2, longitude: 21.0 },
  { icao: "LSZH", iata: "ZRH", latitude: 47.5, longitude: 8.6 },
];

function flight(
  id: number,
  startTime: string,
  options: Partial<{
    callsign: string | null;
    origin: string | null;
    destination: string | null;
    lastSeenAt: string;
    aircraft: { icaoHex: string; registration: string | null; aircraftType: string | null };
  }> = {},
): Row {
  const aircraft = options.aircraft ?? { icaoHex: "ABC123", registration: "OK-ABC", aircraftType: "A320" };
  return {
    id,
    callsign: options.callsign === undefined ? `TEST${id}` : options.callsign,
    registration: null,
    aircraftType: null,
    origin: options.origin === undefined ? "PRG" : options.origin,
    destination: options.destination === undefined ? "FRA" : options.destination,
    startTime: new Date(startTime),
    lastSeenAt: new Date(options.lastSeenAt ?? startTime),
    aircraft,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(getPrisma).mockReset();
  vi.mocked(resolveAirportDetail).mockReset();
});

describe("airport traffic summary v1", () => {
  it("uses Europe/Prague calendar boundaries for 7d and 30d", () => {
    vi.stubEnv("APP_TIMEZONE", "Europe/Prague");
    const now = new Date("2026-01-02T00:30:00Z");
    expect(airportTrafficRangeBounds("7d", now).from).toEqual(new Date("2025-12-26T23:00:00Z"));
    expect(airportTrafficRangeBounds("30d", now).from).toEqual(new Date("2025-12-03T23:00:00Z"));
  });

  it("aggregates arrivals, departures, aircraft identity, active days, routes and callsigns", async () => {
    const counters = { all: 0, in: 0 };
    const flights = [
      flight(1, "2026-09-08T08:00:00Z", { destination: "EDDF", aircraft: { icaoHex: "ABC123", registration: "OK-ABC", aircraftType: "A320" } }),
      flight(2, "2026-09-07T08:00:00Z", { origin: "FRA", destination: "LKPR", aircraft: { icaoHex: "DEF456", registration: "N-DEF", aircraftType: "PC12" } }),
      flight(3, "2026-09-06T08:00:00Z", { destination: "AMS", callsign: " " }),
      flight(4, "2026-09-05T08:00:00Z", { destination: null, callsign: null }),
      flight(5, "2026-09-04T08:00:00Z", { origin: "LKPR", destination: "LKPR" }),
      flight(6, "2026-09-03T08:00:00Z", { origin: "PRG", destination: "LHR" }),
      flight(7, "2026-09-02T08:00:00Z", { origin: "PRG", destination: "VIE" }),
      flight(8, "2026-09-01T08:00:00Z", { origin: "PRG", destination: "WAW" }),
      flight(9, "2026-08-31T08:00:00Z", { origin: "PRG", destination: "ZRH" }),
      flight(10, "2026-08-30T08:00:00Z", { origin: "PRG", destination: "FRA" }),
      flight(11, "2026-08-29T08:00:00Z", { origin: "PRG", destination: "AMS" }),
      flight(12, "2026-08-28T08:00:00Z", { origin: "PRG", destination: "LHR" }),
      flight(13, "2026-08-27T08:00:00Z", { origin: "PRG", destination: "VIE" }),
      flight(14, "2026-08-26T08:00:00Z", { origin: "PRG", destination: "ZZZZ" }),
      flight(15, "2026-08-25T08:00:00Z", { origin: "FRA", destination: "PRG", aircraft: { icaoHex: "ABC123", registration: "OK-ABC", aircraftType: "A320" } }),
      flight(16, "2026-07-20T08:00:00Z", { origin: "PRG", destination: "FRA" }),
    ];
    vi.mocked(getPrisma).mockReturnValue(fakeDatabase(flights, routeAirports, counters) as never);

    const result = await getAirportTrafficSummary(prague, { range: "30d", now: new Date("2026-09-08T12:00:00Z") });

    expect(result).toMatchObject({
      range: "30d",
      flights: 15,
      departures: 13,
      arrivals: 3,
      uniqueAircraft: 2,
      activeDays: 15,
      firstCapturedAt: "2026-08-25T08:00:00.000Z",
      lastCapturedAt: "2026-09-08T08:00:00.000Z",
    });
    expect(result.topDestinations.slice(0, 2)).toEqual([
      { airport: { icaoCode: "EDDF", iataCode: "FRA" }, count: 2 },
      { airport: { icaoCode: "EGLL", iataCode: "LHR" }, count: 2 },
    ]);
    expect(result.topOrigins[0]).toEqual({ airport: { icaoCode: "EDDF", iataCode: "FRA" }, count: 2 });
    expect(result.topAircraft[0]).toMatchObject({ icaoHex: "ABC123", registration: "OK-ABC", count: 14 });
    expect(result.topCallsigns[0]).toEqual({ callsign: "TEST1", count: 1 });
    expect(result.topCallsigns).toHaveLength(5);
    expect(result.recentTraffic).toHaveLength(AIRPORT_TRAFFIC_RECENT_LIMIT);
    expect(result.recentTraffic[0]).toMatchObject({ id: 1, direction: "departure", otherAirport: { icaoCode: "EDDF" } });
    expect(result.heatmap.cells).toHaveLength(7 * 24);
    expect(result.heatmap.cells.find((cell) => cell.dayOfWeek === 2 && cell.hour === 10)).toMatchObject({ arrivals: 1, departures: 2 });
    expect(result.heatmap.maxCount).toBeGreaterThan(0);
    expect(result.recentTraffic.find((item) => item.id === 4)?.otherAirport).toBeNull();
    expect(result.topDestinations.some((item) => item.airport.icaoCode === "ZZZZ")).toBe(false);
    expect(result.topDestinations).toHaveLength(AIRPORT_TRAFFIC_TOP_LIMIT);
    expect(result.topAircraft.length).toBeLessThanOrEqual(AIRPORT_TRAFFIC_TOP_LIMIT);
    expect(result.topOrigins.length).toBeLessThanOrEqual(AIRPORT_TRAFFIC_TOP_LIMIT);
    expect(counters.all).toBe(4);
    expect(counters.in).toBeGreaterThanOrEqual(4);
  });

  it("uses bounded 7d queries and excludes a flight before the Prague boundary", async () => {
    const counters = { all: 0, in: 0 };
    const flights = [
      flight(1, "2026-01-02T00:00:00Z"),
      flight(2, "2025-12-26T22:59:00Z"),
      flight(3, "2025-12-26T23:00:00Z"),
    ];
    vi.stubEnv("APP_TIMEZONE", "Europe/Prague");
    vi.mocked(getPrisma).mockReturnValue(fakeDatabase(flights, routeAirports, counters) as never);

    const result = await getAirportTrafficSummary(prague, { range: "7d", now: new Date("2026-01-02T00:30:00Z") });

    expect(result.flights).toBe(2);
    expect(result.recentTraffic.map((item) => item.id)).toEqual([1, 3]);
  });

  it("caps every ranking at five and recent traffic at ten", async () => {
    const counters = { all: 0, in: 0 };
    const codes = routeAirports.slice(1).map((airport) => airport.icao);
    const flights = [...codes, ...codes].map((code, index) => flight(index + 1, `2026-09-${String(8 - (index % 7)).padStart(2, "0")}T08:00:00Z`, {
      origin: index < codes.length ? "PRG" : code,
      destination: index < codes.length ? code : "PRG",
      callsign: `CAP${index}`,
      aircraft: { icaoHex: (index + 1).toString(16).padStart(6, "0").toUpperCase(), registration: `REG-${index}`, aircraftType: "A320" },
    }));
    vi.mocked(getPrisma).mockReturnValue(fakeDatabase(flights, routeAirports, counters) as never);

    const result = await getAirportTrafficSummary(prague, { range: "30d", now: new Date("2026-09-08T12:00:00Z") });

    expect(result.topDestinations).toHaveLength(AIRPORT_TRAFFIC_TOP_LIMIT);
    expect(result.topOrigins).toHaveLength(AIRPORT_TRAFFIC_TOP_LIMIT);
    expect(result.topAircraft).toHaveLength(AIRPORT_TRAFFIC_TOP_LIMIT);
    expect(result.topCallsigns).toHaveLength(AIRPORT_TRAFFIC_TOP_LIMIT);
    expect(result.recentTraffic).toHaveLength(AIRPORT_TRAFFIC_RECENT_LIMIT);
  });

  it("returns a true empty state without reading positions", async () => {
    const counters = { all: 0, in: 0 };
    vi.mocked(getPrisma).mockReturnValue(fakeDatabase([], routeAirports, counters) as never);

    await expect(getAirportTrafficSummary(prague, { range: "30d", now: new Date("2026-09-08T12:00:00Z") })).resolves.toMatchObject({
      flights: 0,
      departures: 0,
      arrivals: 0,
      uniqueAircraft: 0,
      activeDays: 0,
      firstCapturedAt: null,
      lastCapturedAt: null,
      topDestinations: [],
      topOrigins: [],
      topAircraft: [],
      topCallsigns: [],
      recentTraffic: [],
      heatmap: { maxCount: 0 },
    });
    expect(readFileSync(new URL("../lib/server/airport-traffic.ts", import.meta.url), "utf8")).not.toContain("FlightPosition");
    expect(readFileSync(new URL("../lib/server/airport-traffic.ts", import.meta.url), "utf8")).not.toContain("fetch(");
  });

  it("serves 30d by default, validates the range, and preserves canonical deep links", async () => {
    const counters = { all: 0, in: 0 };
    vi.mocked(resolveAirportDetail).mockResolvedValue(prague);
    vi.mocked(getPrisma).mockReturnValue(fakeDatabase([], routeAirports, counters) as never);

    const defaultResponse = await getAirportTraffic(new Request("http://localhost/api/airports/lkpr/traffic"), { params: Promise.resolve({ icao: "lkpr" }) });
    const invalidResponse = await getAirportTraffic(new Request("http://localhost/api/airports/lkpr/traffic?range=today"), { params: Promise.resolve({ icao: "lkpr" }) });

    expect(defaultResponse.status).toBe(200);
    expect(defaultResponse.headers.get("Cache-Control")).toBe("public, max-age=30, stale-while-revalidate=120");
    expect((await defaultResponse.json()).range).toBe("30d");
    expect(invalidResponse.status).toBe(400);
    expect(aircraftAirportHref("EDDF")).toBe("/airports/EDDF");
    expect(aircraftHistoryHref(42)).toBe("/history?flightId=42");
    expect(aircraftFlightHref(42)).toBe("/flights/42");
  });

  it("keeps Czech and English airport traffic copy available", () => {
    expect(getTranslations("cs").airportTraffic).toMatchObject({ title: "Provoz zachycený přijímačem", rangeThirtyDays: "30 dní" });
    expect(getTranslations("en").airportTraffic).toMatchObject({ title: "Observed receiver traffic", rangeThirtyDays: "30 days" });
    const componentSource = readFileSync(new URL("../components/airport-traffic-summary.tsx", import.meta.url), "utf8");
    expect(componentSource).toContain("/aircraft/${encodeURIComponent(item.icaoHex)}");
    expect(componentSource).toContain("aircraftFlightHref(flight.id)");
  });
});
