import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeAircraft } from "@/lib/aircraft/normalize";
import type { AircraftView } from "@/lib/aircraft/types";
import { GET as getSearch } from "@/app/api/search/route";
import type { AirportDatabaseRow } from "@/lib/server/airport-resolver";
import { searchGlobal, smartSearchActions } from "@/lib/server/search";
import { getTranslations } from "@/lib/i18n";

vi.mock("@/lib/server/db", () => ({ getPrisma: vi.fn(() => null) }));

const receiver = { lat: 50.0755, lon: 14.4378, name: "Test receiver" };

function aircraft(overrides: Partial<AircraftView> = {}): AircraftView {
  const normalized = normalizeAircraft({
    hex: "48AF05",
    flight: "LOT3TD",
    r: "SP-LVF",
    t: "B38M",
    desc: "Boeing 737 MAX 8",
    lat: 50,
    lon: 14,
  }, receiver, new Date("2026-09-08T12:00:00.000Z"));
  if (!normalized) throw new Error("test aircraft could not be normalized");
  return { ...normalized, ...overrides };
}

function airport(overrides: Partial<AirportDatabaseRow> = {}): AirportDatabaseRow {
  return {
    icao: "LKPR",
    iata: "PRG",
    name: "Václav Havel Airport Prague",
    city: "Prague",
    country: "Czechia",
    latitude: 50.1008,
    longitude: 14.26,
    ...overrides,
  };
}

function like(value: string | null, pattern: string): boolean {
  if (!value) return false;
  const expression = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/%/g, ".*")
    .replace(/_/g, ".");
  return new RegExp(`^${expression}$`, "i").test(value);
}

class AirportTable {
  readonly limits: number[] = [];

  constructor(private readonly rows: AirportDatabaseRow[]) {}

  where(filter: Record<string, string> | ((fields: Record<string, { ilike(pattern: string): boolean }>) => boolean)) {
    const filtered = typeof filter === "function"
      ? this.rows.filter((row) => filter({
          icao: { ilike: (pattern) => like(row.icao, pattern) },
          iata: { ilike: (pattern) => like(row.iata, pattern) },
          name: { ilike: (pattern) => like(row.name, pattern) },
          city: { ilike: (pattern) => like(row.city, pattern) },
        }))
      : this.rows.filter((row) => Object.entries(filter).every(([key, value]) => row[key as keyof AirportDatabaseRow] === value));
    return {
      limit: (value: number) => {
        this.limits.push(value);
        return {
          all: async () => filtered.slice(0, value),
        };
      },
    };
  }
}

function database(rows: AirportDatabaseRow[]) {
  return { orm: { public: { Airport: new AirportTable(rows) } } } as never;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("global search", () => {
  it("searches live aircraft by exact ICAO hex and normalizes lowercase input", async () => {
    const result = await searchGlobal(" 48af05 ", { aircraft: [aircraft()], database: null });
    expect(result.aircraft[0]).toMatchObject({ icaoHex: "48AF05", href: "/aircraft/48AF05" });
  });

  it("searches live registration and callsign plus bounded metadata fields", async () => {
    const item = aircraft({
      callsign: "LOT3TD",
      registration: "SP-LVF",
      enrichment: {
        metadata: {
          registration: "SP-LVF",
          registrationCountry: "Poland",
          registrationCountryCode: "PL",
          aircraftType: "B38M",
          icaoTypeCode: "B38M",
          aircraftDescription: "Boeing 737 MAX 8",
          operator: "LOT",
          manufacturer: "Boeing",
          source: "test",
          retrievedAt: "2026-09-08T12:00:00.000Z",
        },
      },
    });
    await expect(searchGlobal("sp-lvf", { aircraft: [item], database: null })).resolves.toMatchObject({ aircraft: [{ icaoHex: "48AF05", registration: "SP-LVF" }] });
    await expect(searchGlobal("lot3td", { aircraft: [item], database: null })).resolves.toMatchObject({ aircraft: [{ callsign: "LOT3TD" }] });
    await expect(searchGlobal("boeing", { aircraft: [item], database: null })).resolves.toMatchObject({ aircraft: [{ manufacturer: "Boeing", aircraftType: "Boeing 737 MAX 8" }] });
  });

  it("searches airports by ICAO and keeps an exact ICAO match ahead of text matches", async () => {
    const result = await searchGlobal("lkpr", {
      aircraft: [],
      database: database([
        airport({ icao: "XX01", iata: "XPR", name: "LKPR training field", city: "Other" }),
        airport(),
      ]),
    });
    expect(result.airports[0]).toMatchObject({ icaoCode: "LKPR", iataCode: "PRG", href: "/airports/LKPR" });
  });

  it("searches airport IATA, name and city", async () => {
    const rows = [airport(), airport({ icao: "LKTB", iata: "BRQ", name: "Brno–Tuřany Airport", city: "Brno" })];
    await expect(searchGlobal("brq", { aircraft: [], database: database(rows) })).resolves.toMatchObject({ airports: [{ icaoCode: "LKTB", iataCode: "BRQ" }] });
    await expect(searchGlobal("tuřany", { aircraft: [], database: database(rows) })).resolves.toMatchObject({ airports: [{ icaoCode: "LKTB" }] });
    await expect(searchGlobal("brno", { aircraft: [], database: database(rows) })).resolves.toMatchObject({ airports: [{ icaoCode: "LKTB", city: "Brno" }] });
  });

  it("searches ATS route points and returns their country and routes", async () => {
    const result = await searchGlobal("BODAL", {
      aircraft: [],
      database: null,
      atsDocuments: [{
        schemaVersion: 1,
        source: { name: "Test ATS", reference: "https://example.test/ats", effectiveDate: "2026-09-01", aipAmendment: null, airacAmendment: null, countryCode: "AT" },
        routes: [{
          designator: "L12",
          points: [{ id: "AT-L12-BODAL", name: "BODAL", kind: "DESIGNATED_POINT", latitude: 47.2, longitude: 11.1, foreignMaintainer: null, remarks: null }],
          segments: [],
          discontinuities: [],
        }],
        counts: { routes: 1, points: 1, segments: 0, cdrSegments: 0, discontinuities: 0 },
      }],
    });
    expect(result.atsPoints[0]).toMatchObject({ name: "BODAL", countryCode: "AT", pointKind: "DESIGNATED_POINT", routeDesignators: ["L12"] });
    expect(result.atsPoints[0]?.href).toContain("atsPoint=AT%3ABODAL");
  });

  it("searches supplied global NAVAID/FIX reference points without a live upstream dependency", async () => {
    const result = await searchGlobal("BNO", {
      aircraft: [],
      database: null,
      atsDocuments: [],
      flights: [],
      navPoints: [{
        id: "BNO",
        kind: "NAVAID",
        type: "VOR",
        name: "Brno",
        latitude: 49.15,
        longitude: 16.69,
        elevationFt: 778,
        frequencyMhz: 114.45,
        magneticDeclination: null,
        state: null,
        country: "CZ",
        source: "Aviation Weather Center",
      }],
    });
    expect(result.navPoints).toEqual([
      expect.objectContaining({
        kind: "nav-point",
        name: "Brno",
        pointKind: "NAVAID",
        countryCode: "CZ",
        frequencyMhz: 114.45,
      }),
    ]);
    expect(result.navPoints[0]?.href).toContain("navPoint=NAVAID%3ABNO%3A49.150000%3A16.690000");
  });

  it("keeps total results bounded and every airport database query bounded", async () => {
    const rows = Array.from({ length: 40 }, (_, index) => airport({
      icao: `LK${String(index).padStart(2, "0")}`,
      iata: `A${String(index).padStart(2, "0")}`,
      name: `Airport ${index}`,
      city: `City ${index}`,
    }));
    const table = new AirportTable(rows);
    const result = await searchGlobal("air", { aircraft: [], database: { orm: { public: { Airport: table } } } as never });
    expect(result.aircraft.length + result.airports.length).toBeLessThanOrEqual(12);
    expect(table.limits.every((value) => value <= 12)).toBe(true);
  });

  it("does not query for a short or empty query and returns an empty result", async () => {
    const table = new AirportTable([airport()]);
    await expect(searchGlobal("a", { aircraft: [], database: { orm: { public: { Airport: table } } } as never })).resolves.toEqual({ query: "", aircraft: [], airports: [], atsPoints: [], atsRoutes: [], sectors: [], navPoints: [], flights: [], actions: [] });
    await expect(searchGlobal("  ", { aircraft: [], database: { orm: { public: { Airport: table } } } as never })).resolves.toEqual({ query: "", aircraft: [], airports: [], atsPoints: [], atsRoutes: [], sectors: [], navPoints: [], flights: [], actions: [] });
    expect(table.limits).toEqual([]);
  });

  it("keeps live aircraft search working when the database is unavailable", async () => {
    const result = await searchGlobal("lot3td", { aircraft: [aircraft()], database: null });
    expect(result.aircraft).toHaveLength(1);
    expect(result.airports).toEqual([]);
  });

  it("falls back without leaking an airport database error", async () => {
    const failingDatabase = {
      orm: { public: { Airport: { where: () => { throw new Error("database connection details"); } } } },
    } as never;
    const result = await searchGlobal("prg", { aircraft: [], database: failingDatabase });
    expect(result.airports).toMatchObject([{ icaoCode: "LKPR", iataCode: "PRG" }]);
    expect(JSON.stringify(result)).not.toContain("database connection details");
  });

  it("returns bounded historical Flight results through the shared search response", async () => {
    const result = await searchGlobal("CSA123", {
      aircraft: [],
      database: null,
      atsDocuments: [],
      flights: [{
        kind: "flight",
        id: 42,
        icaoHex: "49D001",
        callsign: "CSA123",
        registration: "OK-TST",
        aircraftType: "A320",
        origin: "LKPR",
        destination: "LOWW",
        startTime: "2026-10-04T07:00:00.000Z",
        href: "/flights/42",
      }],
    });

    expect(result.flights).toEqual([expect.objectContaining({
      id: 42,
      callsign: "CSA123",
      href: "/flights/42",
    })]);
    expect(result.actions).toEqual([]);
  });

  it("recognizes deterministic smart actions without live or database dependencies", async () => {
    expect(smartSearchActions("go-arounds today")).toEqual([
      { kind: "action", intent: "go_arounds_today", airportIcao: null, href: "/recap/daily#operational-events" },
    ]);
    expect(smartSearchActions("vzácná letadla dnes")).toEqual([
      { kind: "action", intent: "rare_aircraft_today", airportIcao: null, href: "/recap/daily#interesting-aircraft" },
    ]);
    expect(smartSearchActions("LOWW operations")).toEqual([
      { kind: "action", intent: "airport_operations", airportIcao: "LOWW", href: "/airports/LOWW#airport-intelligence-v3" },
    ]);
    expect(smartSearchActions("lety do LKPR")).toEqual([
      { kind: "action", intent: "flights_to_airport", airportIcao: "LKPR", href: "/flights?range=7d&destination=LKPR" },
    ]);

    await expect(searchGlobal("LOWW operations")).resolves.toMatchObject({
      actions: [{ intent: "airport_operations", airportIcao: "LOWW" }],
      aircraft: [],
      airports: [],
      atsPoints: [],
      flights: [],
    });
  });

  it("returns only safe public DTO fields", async () => {
    const result = await searchGlobal("48af05", { aircraft: [aircraft()], database: null });
    expect(Object.keys(result.aircraft[0] ?? {}).sort()).toEqual(["aircraftType", "callsign", "href", "icaoHex", "kind", "manufacturer", "registration"].sort());
    expect(result.aircraft[0]).not.toHaveProperty("lat");
    expect(result.aircraft[0]).not.toHaveProperty("trail");
  });
});

describe("global search API/UI contract", () => {
  it("rejects empty and too-short public queries", async () => {
    await expect(getSearch(new Request("http://localhost/api/search?q=a"))).resolves.toHaveProperty("status", 400);
    await expect(getSearch(new Request("http://localhost/api/search?q="))).resolves.toHaveProperty("status", 400);
  });

  it("keeps Czech and English category and state labels", () => {
    expect(getTranslations("cs").search).toMatchObject({ globalLabel: "Globální vyhledávání", aircraftResults: "Letadla", airportResults: "Letiště", atsPointResults: "Traťové body", navPointResults: "Globální NAVAID / FIX", flightResults: "Historické lety", loading: "Vyhledávání…" });
    expect(getTranslations("en").search).toMatchObject({ globalLabel: "Global search", aircraftResults: "Aircraft", airportResults: "Airports", atsPointResults: "ATS points", navPointResults: "Global NAVAID / FIX", flightResults: "Historical flights", loading: "Searching…" });
  });

  it("routes the topbar trigger into the global Command Search palette", () => {
    const triggerSource = readFileSync(new URL("../components/global-search.tsx", import.meta.url), "utf8");
    const paletteSource = readFileSync(new URL("../components/command-palette.tsx", import.meta.url), "utf8");
    expect(triggerSource).toContain("requestCommandPaletteOpen");
    expect(triggerSource).toContain('data-testid="command-palette-trigger"');
    expect(paletteSource).toContain("SEARCH_DEBOUNCE_MS = 220");
    expect(paletteSource).toContain("/api/search?q=");
    expect(paletteSource).toContain("ArrowDown");
    expect(paletteSource).toContain("ArrowUp");
    expect(paletteSource).toContain('event.key === "Enter"');
    expect(paletteSource).toContain('event.key === "Escape"');
    expect(paletteSource).toContain('role="listbox"');
  });
});
