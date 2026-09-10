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
    expect(result.taf).toMatchObject({
      rawText: tafPayload[0].rawTAF,
      issueTime: "2026-09-08T08:00:00.000Z",
      validFrom: "2026-09-08T09:00:00.000Z",
      validTo: "2026-09-09T15:00:00.000Z",
    });
    expect(result.taf?.periods).toHaveLength(0);
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

  it("normalizes structured METAR clouds, weather tokens, coordinates and fractional visibility", async () => {
    const provider = providerWith(response([{ ...metarPayload[0], visib: "M1/4", clouds: [{ cover: "BKN", base: 800 }], wxString: "-RA BR", lat: 50.1, lon: 14.2 }]), new Response(null, { status: 204 }));
    await expect(provider.getAirportWeather("LKPR")).resolves.toMatchObject({
      metar: {
        visibilityMeters: Math.round(0.25 * 1609.344),
        visibilityLessThan: true,
        clouds: [{ cover: "BKN", baseFtAgl: 800 }],
        weather: ["-RA", "BR"],
        latitude: 50.1,
        longitude: 14.2,
      },
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

describe("AviationWeatherCache", () => {
  it("serves a fresh entry without invoking the loader again", async () => {
    const cache = new AviationWeatherCache();
    const loader = vi.fn().mockResolvedValue("fresh value");

    await cache.get("metar", "LKPR", loader, { ttlMs: 60_000 });
    await cache.get("metar", "LKPR", loader, { ttlMs: 60_000 });

    expect(loader).toHaveBeenCalledOnce();
  });

  it("coalesces concurrent lookups for one product and airport", async () => {
    let release!: (value: string) => void;
    const loader = vi.fn(() => new Promise<string>((resolve) => {
      release = resolve;
    }));
    const cache = new AviationWeatherCache();

    const first = cache.get("metar", "LKPR", loader, { ttlMs: 60_000 });
    const second = cache.get("metar", "LKPR", loader, { ttlMs: 60_000 });
    expect(loader).toHaveBeenCalledOnce();

    release("shared value");
    await expect(Promise.all([first, second])).resolves.toEqual([
      { value: "shared value", stale: false, failed: false },
      { value: "shared value", stale: false, failed: false },
    ]);
  });

  it("evicts the least recently used airport while retaining a bounded product cache", async () => {
    const cache = new AviationWeatherCache(2);
    const loader = vi.fn().mockResolvedValue("value");
    const options = { ttlMs: 60_000 };

    await cache.get("metar", "LKPR", loader, options);
    await cache.get("taf", "LKPR", loader, options);
    await cache.get("metar", "EDDF", loader, options);
    await cache.get("taf", "EDDF", loader, options);
    await cache.get("metar", "LOWW", loader, options);

    expect(cache.airportCount()).toBe(2);
    expect(cache.size()).toBe(3);

    const callsBeforeEvictedLookup = loader.mock.calls.length;
    await cache.get("metar", "LKPR", loader, options);
    expect(loader).toHaveBeenCalledTimes(callsBeforeEvictedLookup + 1);
    expect(cache.airportCount()).toBe(2);
    expect(cache.size()).toBeLessThanOrEqual(4);
  });

  it("returns a successful stale value only inside the one-hour stale window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const cache = new AviationWeatherCache();
    let calls = 0;
    const loader = vi.fn(async () => {
      calls += 1;
      if (calls === 1) return "fresh value";
      throw new Error("upstream down");
    });

    await cache.get("metar", "LKPR", loader, { ttlMs: 100 });
    vi.setSystemTime(101);
    await expect(cache.get("metar", "LKPR", loader, { ttlMs: 100 })).resolves.toEqual({
      value: "fresh value", stale: true, failed: false,
    });

    vi.setSystemTime(100 + 60 * 60_000 + 1);
    await expect(cache.get("metar", "LKPR", loader, { ttlMs: 100 })).resolves.toEqual({
      value: null, stale: false, failed: true,
    });
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

  it("returns the public weather DTO without receiver coordinates, secrets, or upstream fields", async () => {
    const result = await getWeatherAirportResponse(new Request("http://localhost"), "LKPR", {
      airportResolver: { resolve: vi.fn().mockResolvedValue(airport) },
      weatherProvider: {
        getAirportWeather: vi.fn().mockResolvedValue({
          icaoCode: "LKPR",
          metar: null,
          taf: null,
          fetchedAt: "2026-09-08T08:00:00.000Z",
          stale: false,
        }),
      },
    });

    expect(result.status).toBe(200);
    const body = await result.json();
    expect(body).toMatchObject({
      airport: { icaoCode: "LKPR", latitude: airport.latitude, longitude: airport.longitude },
      metar: null,
      taf: null,
      stale: false,
    });
    expect(body).not.toHaveProperty("receiver");
    expect(body).not.toHaveProperty("DATABASE_URL");
    expect(JSON.stringify(body)).not.toContain("DATABASE_URL");
    expect(JSON.stringify(body)).not.toContain("upstream");
  });

  it("returns a 200 response when only one weather product is available", async () => {
    const result = await getWeatherAirportResponse(new Request("http://localhost"), "LKPR", {
      airportResolver: { resolve: vi.fn().mockResolvedValue(airport) },
      weatherProvider: {
        getAirportWeather: vi.fn().mockResolvedValue({
          icaoCode: "LKPR",
          metar: {
            rawText: "METAR LKPR 080800Z 19005KT CAVOK",
            observationTime: "2026-09-08T08:00:00.000Z",
            temperatureC: 23,
            dewpointC: 14,
            windDirectionDeg: 190,
            windVariable: false,
            windSpeedKt: 5,
            windGustKt: null,
            visibilityMeters: 10_000,
            visibilityGreaterThan: false,
            altimeterHpa: 1016,
            flightCategory: "VFR",
          },
          taf: null,
          fetchedAt: "2026-09-08T08:00:00.000Z",
          stale: false,
        }),
      },
    });

    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toMatchObject({
      metar: { rawText: "METAR LKPR 080800Z 19005KT CAVOK" },
      taf: null,
    });
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
