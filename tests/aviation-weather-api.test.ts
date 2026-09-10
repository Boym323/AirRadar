import { describe, expect, it, vi } from "vitest";
import type { Airport } from "@/lib/airports/types";
import { getSigmetResponse, getWeatherAirportsResponse } from "@/lib/server/weather-api";

const airports: Record<string, Airport> = {
  LKPR: { icaoCode: "LKPR", iataCode: "PRG", name: "Prague", city: "Prague", country: "CZ", latitude: 50.1, longitude: 14.2 },
  EDDF: { icaoCode: "EDDF", iataCode: "FRA", name: "Frankfurt", city: "Frankfurt", country: "DE", latitude: 50.0, longitude: 8.5 },
};

describe("aviation weather API contracts", () => {
  it("fetches a bounded canonical ICAO batch and never sends IATA upstream", async () => {
    const getAirportWeather = vi.fn().mockImplementation(async (icaoCode: string) => ({ icaoCode, metar: null, taf: null, fetchedAt: "2026-09-09T12:00:00Z", stale: false }));
    const resolver = { resolve: vi.fn(async ({ icaoCode }: { icaoCode: string }) => airports[icaoCode] ?? null) };
    const response = await getWeatherAirportsResponse(new Request("http://localhost/api/weather/airport?icao=lkpr,eddf"), "lkpr,eddf", { airportResolver: resolver, weatherProvider: { getAirportWeather } });
    expect(response.status).toBe(200);
    expect(getAirportWeather.mock.calls.map(([icao]) => icao)).toEqual(["LKPR", "EDDF"]);
    await expect(response.json()).resolves.toMatchObject({ airports: [{ airport: { icaoCode: "LKPR" } }, { airport: { icaoCode: "EDDF" } }] });
  });

  it("rejects invalid and over-sized batches before resolver/provider calls", async () => {
    const resolve = vi.fn();
    const getAirportWeather = vi.fn();
    await expect(getWeatherAirportsResponse(new Request("http://localhost"), "PRG,LKPR", { airportResolver: { resolve }, weatherProvider: { getAirportWeather } })).resolves.toMatchObject({ status: 400 });
    await expect(getWeatherAirportsResponse(new Request("http://localhost"), Array.from({ length: 9 }, () => "LKPR").join(","), { airportResolver: { resolve }, weatherProvider: { getAirportWeather } })).resolves.toMatchObject({ status: 400 });
    expect(resolve).not.toHaveBeenCalled();
    expect(getAirportWeather).not.toHaveBeenCalled();
  });

  it("returns a disabled response without probing the provider", async () => {
    const getAirportWeather = vi.fn();
    const getSigmets = vi.fn();
    const airportResponse = await getWeatherAirportsResponse(new Request("http://localhost"), "LKPR", { enabled: false, weatherProvider: { getAirportWeather, getSigmets } });
    const sigmetResponse = await getSigmetResponse(new Request("http://localhost"), { enabled: false, weatherProvider: { getAirportWeather, getSigmets } });
    expect(airportResponse.status).toBe(200);
    expect(sigmetResponse.status).toBe(200);
    expect(getAirportWeather).not.toHaveBeenCalled();
    expect(getSigmets).not.toHaveBeenCalled();
    await expect(airportResponse.json()).resolves.toMatchObject({ enabled: false, available: false });
  });
});
