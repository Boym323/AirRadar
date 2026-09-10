import { describe, expect, it, vi } from "vitest";
import type { Airport } from "@/lib/airports/types";
import {
  AirportResolver,
  type AirportDatabase,
  type AirportDatabaseRow,
  normalizeAirportIata,
  normalizeAirportIcao,
} from "@/lib/server/airport-resolver";
import { AdsbDbProvider } from "@/lib/server/adsbdb-provider";

const prague: AirportDatabaseRow = {
  icao: "LKPR", iata: "PRG", name: "Database Prague", city: "Prague", country: "Czechia", latitude: 50.1008, longitude: 14.26,
};
const brno: AirportDatabaseRow = {
  icao: "LKTB", iata: "BRQ", name: "Brno–Tuřany Airport", city: "Brno", country: "Czechia", latitude: 49.1513, longitude: 16.6944,
};
const frankfurt: AirportDatabaseRow = {
  icao: "EDDF", iata: "FRA", name: "Database Frankfurt", city: "Frankfurt", country: "Germany", latitude: 50.0379, longitude: 8.5622,
};

function fakeDatabase(rows: AirportDatabaseRow[], fail = false): AirportDatabase {
  return {
    orm: {
      public: {
        Airport: {
          where(filter) {
            return {
              async first() {
                if (fail) throw new Error("database offline");
                const row = rows.find((candidate) =>
                  (filter.icao && candidate.icao === filter.icao)
                  || (filter.iata && candidate.iata === filter.iata),
                );
                return row ?? null;
              },
            };
          },
        },
      },
    },
  };
}

function providerAirport(overrides: Partial<Airport> = {}): Airport {
  return {
    icaoCode: "ZZZZ",
    iataCode: "ZZZ",
    name: "Provider airport",
    city: "Provider City",
    country: "Provider Country",
    latitude: 10,
    longitude: 20,
    ...overrides,
  };
}

describe("central airport resolver", () => {
  it("normalizes ICAO and IATA codes and rejects invalid values", () => {
    expect(normalizeAirportIcao(" lkpr ")).toBe("LKPR");
    expect(normalizeAirportIata(" prg ")).toBe("PRG");
    expect(normalizeAirportIcao("PRG")).toBeNull();
    expect(normalizeAirportIata("LKPR")).toBeNull();
    expect(normalizeAirportIcao(" ")).toBeNull();
    expect(normalizeAirportIata(null)).toBeNull();
  });

  it("resolves a valid ICAO from the database", async () => {
    const airport = await new AirportResolver(() => fakeDatabase([prague])).resolve({ icaoCode: "lkpr" });
    expect(airport).toEqual({
      icaoCode: "LKPR", iataCode: "PRG", name: "Database Prague", city: "Prague", country: "Czechia", latitude: 50.1008, longitude: 14.26,
    });
  });

  it("resolves a valid IATA from the database", async () => {
    const airport = await new AirportResolver(() => fakeDatabase([brno])).resolve({ iataCode: " brq " });
    expect(airport?.icaoCode).toBe("LKTB");
    expect(airport?.iataCode).toBe("BRQ");
  });

  it("prefers ICAO over IATA and falls back from an ICAO miss to IATA", async () => {
    const resolver = new AirportResolver(() => fakeDatabase([prague, frankfurt]));
    await expect(resolver.resolve({ icaoCode: "LKPR", iataCode: "FRA" })).resolves.toMatchObject({ icaoCode: "LKPR" });
    await expect(resolver.resolve({ icaoCode: "ZZZZ", iataCode: "FRA" })).resolves.toMatchObject({ icaoCode: "EDDF" });
  });

  it("returns null for an invalid code", async () => {
    await expect(new AirportResolver(() => fakeDatabase([prague])).resolve({ icaoCode: "not-an-airport" })).resolves.toBeNull();
  });

  it("uses valid provider metadata after a database miss", async () => {
    const airport = await new AirportResolver(() => fakeDatabase([])).resolve({
      icaoCode: "ZZZZ", iataCode: "ZZZ", providerAirport: providerAirport(),
    });
    expect(airport).toMatchObject({ icaoCode: "ZZZZ", iataCode: "ZZZ", latitude: 10, longitude: 20 });
  });

  it("uses the sample fallback for incomplete provider metadata", async () => {
    const airport = await new AirportResolver(() => fakeDatabase([])).resolve({
      icaoCode: "LKPR", iataCode: "PRG", providerAirport: providerAirport({ latitude: Number.NaN }),
    });
    expect(airport?.icaoCode).toBe("LKPR");
    expect(airport?.name).toBe("Václav Havel Airport Prague");
  });

  it("continues with provider metadata when the database fails", async () => {
    const airport = await new AirportResolver(() => fakeDatabase([], true)).resolve({
      icaoCode: "ZZZZ", iataCode: "ZZZ", providerAirport: providerAirport(),
    });
    expect(airport?.name).toBe("Provider airport");
  });

  it("continues with sample data when the database fails", async () => {
    await expect(new AirportResolver(() => fakeDatabase([], true)).resolve({ icaoCode: "EDDF" })).resolves.toMatchObject({
      icaoCode: "EDDF", iataCode: "FRA",
    });
  });

  it("covers the explicit sample regression codes and a database-only airport", async () => {
    const sampleResolver = new AirportResolver(() => null);
    await expect(sampleResolver.resolve({ icaoCode: "LKPR" })).resolves.toMatchObject({ icaoCode: "LKPR", iataCode: "PRG" });
    await expect(sampleResolver.resolve({ iataCode: "PRG" })).resolves.toMatchObject({ icaoCode: "LKPR" });
    await expect(sampleResolver.resolve({ icaoCode: "EDDF" })).resolves.toMatchObject({ icaoCode: "EDDF", iataCode: "FRA" });
    await expect(sampleResolver.resolve({ iataCode: "FRA" })).resolves.toMatchObject({ icaoCode: "EDDF" });
    await expect(new AirportResolver(() => fakeDatabase([brno])).resolve({ icaoCode: "LKTB" })).resolves.toMatchObject({ icaoCode: "LKTB", iataCode: "BRQ" });
  });

  it("returns only the public Airport DTO fields", async () => {
    const airport = await new AirportResolver(() => fakeDatabase([{ ...prague, id: 1 } as AirportDatabaseRow])).resolve({ icaoCode: "LKPR" });
    expect(airport).not.toHaveProperty("id");
    expect(airport).not.toHaveProperty("createdAt");
    expect(airport).not.toHaveProperty("updatedAt");
  });

  it("lets ADSBDB route identity remain upstream-owned while resolving DB metadata", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ response: { flightroute: {
      callsign: "TEST123",
      origin: { icao_code: "LKTB", iata_code: "BRQ", name: "Provider Brno", latitude: 49.15, longitude: 16.69 },
      destination: { icao_code: "EDDF", iata_code: "FRA", name: "Provider Frankfurt", latitude: 50.03, longitude: 8.56 },
    } } })));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new AdsbDbProvider("https://example.test/v0", new AirportResolver(() => fakeDatabase([brno, frankfurt])));
    const route = await provider.getRoute("TEST123", new Date("2026-01-01T00:00:00Z"));

    expect(route).toMatchObject({ origin: "LKTB", destination: "EDDF" });
    expect(route?.originAirport).toMatchObject({ icaoCode: "LKTB", iataCode: "BRQ", name: "Brno–Tuřany Airport" });
    expect(route?.destinationAirport).toMatchObject({ icaoCode: "EDDF", iataCode: "FRA", name: "Database Frankfurt" });
  });

  it("resolves an ADSBDB route with IATA-only endpoints to canonical ICAO", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ response: { flightroute: {
      callsign: "TEST456",
      origin: { iata_code: "brq", name: "Provider Brno", latitude: 49.15, longitude: 16.69 },
      destination: { iata_code: "fra", name: "Provider Frankfurt", latitude: 50.03, longitude: 8.56 },
    } } }))));

    const provider = new AdsbDbProvider("https://example.test/v0", new AirportResolver(() => fakeDatabase([brno, frankfurt])));
    const route = await provider.getRoute("TEST456", new Date("2026-01-01T00:00:00Z"));

    expect(route).toMatchObject({ origin: "LKTB", destination: "EDDF" });
    expect(route?.originAirport?.icaoCode).toBe("LKTB");
    expect(route?.destinationAirport?.icaoCode).toBe("EDDF");
  });

  it("does not manufacture an ICAO identity from an unresolved IATA-only provider object", async () => {
    const resolver = new AirportResolver(() => null);
    await expect(resolver.resolve({ providerAirport: { iataCode: "ZZZ", name: "Unknown", latitude: 10, longitude: 20 } })).resolves.toBeNull();
  });
});
