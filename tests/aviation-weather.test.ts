import { afterEach, describe, expect, it, vi } from "vitest";
import type { Airport } from "@/lib/airports/types";
import {
  AviationWeatherCache,
  AviationWeatherProvider,
  AviationWeatherUnavailableError,
  AVIATION_WEATHER_BASE_URL,
  AVIATION_WEATHER_USER_AGENT,
  normalizeWeatherIcao,
  statuteMilesToMeters,
} from "@/lib/server/aviation-weather-provider";
import { getWeatherAirportResponse } from "@/lib/server/weather-api";
import { formatWeatherVisibility } from "@/lib/i18n";

const airport: Airport = {
  icaoCode: "LKPR", iataCode: "PRG", name: "Václav Havel Airport Prague", city: "Prague", country: "Czechia", latitude: 50.1, longitude: 14.26,
};

const metarPayload = [{
  icaoId: "LKPR", reportTime: "2026-09-08T08:00:00.000Z", obsTime: 1788854400,
  temp: 23, dewp: 14, wdir: 190, wspd: 5, wgst: null, visib: "6+", altim: 1016,
  rawOb: "METAR LKPR 080800Z 19005KT CAVOK 23/14 Q1016", fltCat: "VFR", unrelated: "must not escape",
}];

const tafPayload = [{
  icaoId: "LKPR", issueTime: "2026-09-08T08:00:00.000Z", validTimeFrom: 1788858000, validTimeTo: 1788966000,
  rawTAF: "TAF LKPR 080800Z 0809/0915 20008KT CAVOK", fcsts: [{ ignored: true }],
}];

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function providerWith(...responses: Response[]): AviationWeatherProvider {
  const fetcher = vi.fn();
  for (const item of responses) fetcher.mockResolvedValueOnce(item);
  return new AviationWeatherProvider({ fetcher, timeoutMs: 50 });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("AviationWeatherProvider", () => {
  it("formats statute-mile visibility for the compact weather UI", () => {
    expect(formatWeatherVisibility(statuteMilesToMeters(6), true)).toBe("10+ km");
    expect(formatWeatherVisibility(statuteMilesToMeters(3))).toBe("4,8 km");
  });

  it("normalizes only four-letter ICAO values", () => {
    expect(normalizeWeatherIcao(" lkpr ")).toBe("LKPR");
    expect(normalizeWeatherIcao("PRG")).toBeNull();
    expect(normalizeWeatherIcao("LK1R")).toBeNull();
    expect(normalizeWeatherIcao(null)).toBeNull();
  });

  it("maps the verified METAR JSON fields and drops unrelated upstream fields", async () => {
    const provider = providerWith(response(metarPayload), new Response(null, { status: 204 }));
    const result = await provider.getAirportWeather("lkpr");
    expect(result.metar).toMatchObject({
      rawText: metarPayload[0].rawOb,
      observationTime: "2026-09-08T08:00:00.000Z",
      temperatureC: 23,
      dewpointC: 14,
      windDirectionDeg: 190,
      windVariable: false,
      windSpeedKt: 5,
      visibilityMeters: statuteMilesToMeters(6),
      visibilityGreaterThan: true,
      altimeterHpa: 1016,
      flightCategory: "VFR",
    });
    expect(result.metar).not.toHaveProperty("unrelated");
    expect(result.metar).not.toHaveProperty("lat");
  });

  it("maps TAF JSON and safely handles 204 responses", async () => {
    const provider = providerWith(new Response(null, { status: 204 }), response(tafPayload));
    const result = await provider.getAirportWeather("LKPR");
    expect(result.metar).toBeNull();
    expect(result.taf).toEqual({
      rawText: tafPayload[0].rawTAF,
      issueTime: "2026-09-08T08:00:00.000Z",
      validFrom: "2026-09-08T09:00:00.000Z",
      validTo: "2026-09-09T15:00:00.000Z",
    });
  });

  it("supports a METAR-only or TAF-only partial result", async () => {
    const metarOnly = await providerWith(response(metarPayload), new Response(null, { status: 204 })).getAirportWeather("LKPR");
    expect(metarOnly.metar).not.toBeNull();
    expect(metarOnly.taf).toBeNull();

    const tafOnly = await providerWith(new Response(null, { status: 204 }), response(tafPayload)).getAirportWeather("LKPR");
    expect(tafOnly.metar).toBeNull();
    expect(tafOnly.taf).not.toBeNull();
  });

  it("keeps VRB as a non-numeric direction", async () => {
    const provider = providerWith(response([{ ...metarPayload[0], wdir: "VRB", visib: 3 }]), new Response(null, { status: 204 }));
    await expect(provider.getAirportWeather("LKPR")).resolves.toMatchObject({
      metar: { windDirectionDeg: null, windVariable: true, visibilityMeters: statuteMilesToMeters(3), visibilityGreaterThan: false },
    });
  });

  it("rejects invalid ICAO before making an upstream request", async () => {
    const fetcher = vi.fn();
    await expect(new AviationWeatherProvider({ fetcher }).getAirportWeather("PRG")).rejects.toThrow("Invalid airport ICAO");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("handles timeout, HTTP 429 and malformed JSON without leaking upstream errors", async () => {
    vi.useFakeTimers();
    const timeoutFetcher = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }));
    const timeoutPromise = new AviationWeatherProvider({ fetcher: timeoutFetcher, timeoutMs: 10 }).getAirportWeather("LKPR");
    const timeoutExpectation = expect(timeoutPromise).rejects.toBeInstanceOf(AviationWeatherUnavailableError);
    await vi.advanceTimersByTimeAsync(11);
    await timeoutExpectation;

    const rateLimited = providerWith(new Response("rate limited", { status: 429 }), new Response("rate limited", { status: 429 }));
    await expect(rateLimited.getAirportWeather("LKPR")).rejects.toBeInstanceOf(AviationWeatherUnavailableError);

    const malformed = providerWith(new Response("{not-json", { status: 200 }), new Response("{not-json", { status: 200 }));
    await expect(malformed.getAirportWeather("LKPR")).rejects.toBeInstanceOf(AviationWeatherUnavailableError);
  });

  it("uses the fixed documented URLs and custom user agent", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(metarPayload))
      .mockResolvedValueOnce(response(tafPayload));
    await new AviationWeatherProvider({ fetcher }).getAirportWeather("LKPR");
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      `${AVIATION_WEATHER_BASE_URL}/api/data/metar?ids=LKPR&format=json`,
      `${AVIATION_WEATHER_BASE_URL}/api/data/taf?ids=LKPR&format=json`,
    ]);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ headers: { "User-Agent": AVIATION_WEATHER_USER_AGENT } });
  });

  it("hits the fresh cache once and coalesces concurrent requests", async () => {
    const releases: Array<() => void> = [];
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => {
      releases.push(() => resolve(response([])));
    }));
    const provider = new AviationWeatherProvider({ fetcher });
    const first = provider.getAirportWeather("LKPR");
    const second = provider.getAirportWeather("lkpr");
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const release of releases) release();
    await Promise.all([first, second]);
    await provider.getAirportWeather("LKPR");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("bounds the cache by airport count", async () => {
    const cache = new AviationWeatherCache(2);
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const provider = new AviationWeatherProvider({ fetcher, cache });
    await provider.getAirportWeather("LKPR");
    await provider.getAirportWeather("EDDF");
    await provider.getAirportWeather("LOWW");
    expect(cache.airportCount()).toBeLessThanOrEqual(2);
    expect(cache.size()).toBeLessThanOrEqual(4);
  });

  it("serves a stale successful value after an upstream failure", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(metarPayload))
      .mockResolvedValueOnce(response(tafPayload))
      .mockRejectedValue(new Error("upstream down"));
    const provider = new AviationWeatherProvider({ fetcher });
    const fresh = await provider.getAirportWeather("LKPR");
    expect(fresh.stale).toBe(false);
    vi.advanceTimersByTime(5 * 60_000 + 1);
    const stale = await provider.getAirportWeather("LKPR");
    expect(stale.stale).toBe(true);
    expect(stale.metar?.rawText).toBe(metarPayload[0].rawOb);
  });
});

describe("weather airport API", () => {
  it("uses the central resolver canonical ICAO and does not query arbitrary input upstream", async () => {
    const resolve = vi.fn().mockResolvedValue(airport);
    const getAirportWeather = vi.fn().mockResolvedValue({ metar: null, taf: null, fetchedAt: "2026-09-08T08:00:00.000Z", stale: false, icaoCode: "LKPR" });
    const result = await getWeatherAirportResponse(new Request("http://localhost/api/weather/airport/lkpr"), "lkpr", {
      airportResolver: { resolve },
      weatherProvider: { getAirportWeather },
    });
    expect(result.status).toBe(200);
    expect(resolve).toHaveBeenCalledWith({ icaoCode: "LKPR" });
    expect(getAirportWeather).toHaveBeenCalledWith("LKPR", expect.any(AbortSignal));
    expect(await result.json()).toMatchObject({ airport: { icaoCode: "LKPR" }, metar: null, taf: null });
  });

  it("returns 404 for an unknown airport and 400 for invalid ICAO", async () => {
    const airportResolver = { resolve: vi.fn().mockResolvedValue(null) };
    await expect(getWeatherAirportResponse(new Request("http://localhost"), "ZZZZ", { airportResolver })).resolves.toMatchObject({ status: 404 });
    await expect(getWeatherAirportResponse(new Request("http://localhost"), "PRG", { airportResolver })).resolves.toMatchObject({ status: 400 });
  });

  it("returns 503 for a provider failure without exposing its error", async () => {
    const result = await getWeatherAirportResponse(new Request("http://localhost"), "LKPR", {
      airportResolver: { resolve: vi.fn().mockResolvedValue(airport) },
      weatherProvider: { getAirportWeather: vi.fn().mockRejectedValue(new Error("SECRET upstream details")) },
    });
    expect(result.status).toBe(503);
    const body = await result.json();
    expect(body.error).not.toContain("SECRET");
    expect(body).not.toHaveProperty("receiver");
    expect(body).not.toHaveProperty("FLIGHTAWARE_API_KEY");
  });
});
