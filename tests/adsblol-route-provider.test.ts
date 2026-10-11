import { afterEach, describe, expect, it, vi } from "vitest";
import { AdsbLolRouteProvider, getAdsbLolRoutesetRuntimeDiagnostics, routesetRetryDelayMs } from "@/lib/server/adsblol-route-provider";
import type { AirportResolverLike } from "@/lib/server/airport-resolver";

const observedAt = new Date("2026-10-10T13:00:00Z");
const airports = [
  { icao: "OMDB", iata: "DXB", lat: 25.253, lon: 55.365, name: "Dubai", location: "Dubai", countryiso2: "AE" },
  { icao: "LKPR", iata: "PRG", lat: 50.1008, lon: 14.26, name: "Prague", location: "Prague", countryiso2: "CZ" },
];

const resolver: AirportResolverLike = {
  resolve: async ({ icaoCode, iataCode, providerAirport }) => {
    if (!icaoCode || providerAirport?.latitude == null || providerAirport.longitude == null) return null;
    return {
      icaoCode,
      iataCode: iataCode ?? null,
      name: providerAirport.name ?? icaoCode,
      city: providerAirport.city ?? null,
      country: providerAirport.country ?? null,
      latitude: providerAirport.latitude,
      longitude: providerAirport.longitude,
    };
  },
};

function row(callsign: string, plausible = true) {
  return { callsign, plausible, airport_codes: "OMDB-LKPR", _airports: airports, airline_code: "UAE" };
}

describe("ADSB.lol routeset retry policy", () => {
  it("honors bounded Retry-After and exponential failure backoff", () => {
    expect(routesetRetryDelayMs(429, "90", 1, 0)).toBe(90_000);
    expect(routesetRetryDelayMs(503, "Thu, 01 Jan 1970 00:02:00 GMT", 1, 0)).toBe(120_000);
    expect(routesetRetryDelayMs(429, "999999", 2, 0)).toBe(300_000);
    expect(routesetRetryDelayMs(500, null, 3, 0)).toBe(120_000);
    expect(routesetRetryDelayMs(429, "invalid", 1, 0)).toBe(30_000);
    expect(routesetRetryDelayMs(200, "120", 1, 0)).toBe(30_000);
  });
});

describe("ADSB.lol routeset batch provider", () => {
  afterEach(() => {
    const globals = globalThis as typeof globalThis & {
      airRadarRoutesetRuntime?: { blockedUntilAt?: string | null; nextAllowedAt?: string | null };
    };
    if (globals.airRadarRoutesetRuntime) {
      globals.airRadarRoutesetRuntime.blockedUntilAt = null;
      globals.airRadarRoutesetRuntime.nextAllowedAt = null;
    }
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("collects simultaneous lookups into one bounded POST and parses airport metadata", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { planes: Array<{ callsign: string; lat: number; lng: number }> };
      expect(body.planes).toHaveLength(2);
      expect(body.planes[0]).toEqual({ callsign: "UAE139", lat: 49.2, lng: 17.7 });
      return new Response(JSON.stringify(body.planes.map((plane) => row(plane.callsign))), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new AdsbLolRouteProvider(resolver);
    const first = provider.getRoute(" uae139 ", observedAt, { lat: 49.2, lon: 17.7 });
    const second = provider.getRoute("UAE140", observedAt, { lat: 49.25, lon: 17.72 });
    await vi.advanceTimersByTimeAsync(250);

    const [a, b] = await Promise.all([first, second]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toMatchObject({
      callsign: "UAE139", origin: "OMDB", destination: "LKPR", airlineIcao: "UAE",
      source: "adsblol-routeset", originAirport: { icaoCode: "OMDB" }, destinationAirport: { icaoCode: "LKPR" },
    });
    expect(b?.callsign).toBe("UAE140");
  });

  it("fails closed for implausible, ambiguous, or positionless lookups", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([row("UAE139", false)]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new AdsbLolRouteProvider(resolver);
    await expect(provider.getRoute("UAE139", observedAt)).resolves.toBeNull();
    await expect(provider.getRoute("NOT_A_CALLSIGN", observedAt, { lat: 49, lon: 17 })).resolves.toBeNull();
    const pending = provider.getRoute("UAE139", observedAt, { lat: 49, lon: 17 });
    await vi.advanceTimersByTimeAsync(250);
    await expect(pending).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("opens one shared 6h circuit on upstream 403 and fails queued/new lookups without repeated fetch", async () => {
    vi.useFakeTimers();
    let upstreamStatus = 403;
    const fetchMock = vi.fn(async () =>
      upstreamStatus === 403
        ? new Response("forbidden", { status: 403 })
        : new Response(JSON.stringify([row("UAE139")]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new AdsbLolRouteProvider(resolver);
    const queued = Array.from({ length: 21 }, (_, i) => provider.getRoute(
      "UAE" + String(139 + i), observedAt, { lat: 49.2, lon: 17.7 },
    ));
    const settled = Promise.allSettled(queued);
    await vi.advanceTimersByTimeAsync(250);
    const results = await settled;
    expect(results).toHaveLength(21);
    expect(results.every((result) => result.status === "rejected")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const after = getAdsbLolRoutesetRuntimeDiagnostics();
    expect(after.lastHttpStatus).toBe(403);
    expect(Date.parse(after.blockedUntilAt ?? "") - Date.now()).toBeGreaterThan(5 * 60 * 60_000);
    expect(after.skippedBlocked).toBeGreaterThanOrEqual(1);

    const otherProvider = new AdsbLolRouteProvider(resolver);
    await expect(otherProvider.getRoute("UAE139", observedAt, { lat: 49.2, lon: 17.7 }))
      .rejects.toThrow("retry suspended");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date(Date.now() + 6 * 60 * 60_000 + 1000));
    upstreamStatus = 200;
    const recovery = otherProvider.getRoute("UAE139", observedAt, { lat: 49.2, lon: 17.7 });
    await vi.advanceTimersByTimeAsync(250);
    await expect(recovery).resolves.toMatchObject({ origin: "OMDB", destination: "LKPR" });
    expect(getAdsbLolRoutesetRuntimeDiagnostics().blockedUntilAt).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects transport errors so the enrichment cache does not treat them as valid misses", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status: 429 })));
    const before = getAdsbLolRoutesetRuntimeDiagnostics();
    const provider = new AdsbLolRouteProvider(resolver);
    const pending = provider.getRoute("UAE139", observedAt, { lat: 49.2, lon: 17.7 });
    const assertion = expect(pending).rejects.toThrow("429");
    await vi.advanceTimersByTimeAsync(250);
    await assertion;
    expect(provider.getDiagnostics()).toMatchObject({ requests: 1, failures: 1 });
    const after = getAdsbLolRoutesetRuntimeDiagnostics();
    expect(after.failed).toBe(before.failed + 1);
    expect(after.reasons.http).toBe(before.reasons.http + 1);
    expect(after.lastHttpStatus).toBe(429);
    expect(after.lastFailureAt).toBeTruthy();
    expect(JSON.stringify(after)).not.toContain("UAE139");
  });
});
