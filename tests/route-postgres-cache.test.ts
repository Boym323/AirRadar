import { describe, expect, it, vi } from "vitest";
import { normalizeAircraft } from "@/lib/aircraft/normalize";
import { ENRICHMENT_TTLS, EnrichmentService } from "@/lib/server/enrichment-cache";
import { decodeCachedRoute, validPersistedRoute, type RouteCacheStore } from "@/lib/server/route-postgres-cache";
import type { FlightRoute } from "@/lib/aircraft/types";

const at = new Date("2026-10-10T13:00:00Z");
const key = "flight-route:ABC123:CSA123:2026-10-10";
function aircraft() {
  const result = normalizeAircraft({ hex: "abc123", flight: "CSA123", lat: 50, lon: 14 }, { lat: 50, lon: 14, name: "Test" });
  if (!result) throw new Error("fixture");
  return result;
}
function route(source = "adsbdb"): FlightRoute {
  return {
    callsign: "CSA123", origin: "LKPR", destination: "LZIB", airline: null,
    airlineIata: null, airlineIcao: null, source, retrievedAt: at.toISOString(),
    originAirport: { icaoCode: "LKPR", iataCode: "PRG", name: "Prague", city: "Prague", country: "CZ", latitude: 50.1008, longitude: 14.26 },
    destinationAirport: { icaoCode: "LZIB", iataCode: "BTS", name: "Bratislava", city: "Bratislava", country: "SK", latitude: 48.17, longitude: 17.21 },
  };
}
function fakeStore(get: RouteCacheStore["get"] = async () => null) {
  return { get: vi.fn(get), put: vi.fn(async () => {}) };
}

describe("Route Cache V2 read-through", () => {
  it("reuses a persisted ADSBDB route without querying either free upstream", async () => {
    const stored = route("adsbdb");
    const store = fakeStore(async () => stored);
    const primary = vi.fn(async () => null);
    const fallback = vi.fn(async () => null);
    const service = new EnrichmentService({
      flightRoute: { name: "adsbdb", getRoute: primary },
      flightRouteFallback: { name: "adsblol-routeset", getRoute: fallback },
    }, undefined, undefined, store);
    expect((await service.enrich(aircraft(), at))?.route).toEqual(stored);
    expect((await service.enrich(aircraft(), at))?.route).toEqual(stored);
    expect(store.get).toHaveBeenCalledOnce();
    expect(store.get).toHaveBeenCalledWith(key);
    expect(primary).not.toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();
    expect(store.put).not.toHaveBeenCalled();
  });

  it("writes validated primary free results to PostgreSQL", async () => {
    const store = fakeStore();
    const primary = vi.fn(async () => route());
    const service = new EnrichmentService({ flightRoute: { name: "adsbdb", getRoute: primary } }, undefined, undefined, store);
    await service.enrich(aircraft(), at);
    expect(store.put).toHaveBeenCalledWith(key, route(), ENRICHMENT_TTLS.routeMs);
    expect(primary).toHaveBeenCalledOnce();
  });

  it("writes the validated ADSB.lol fallback when primary is unavailable", async () => {
    const store = fakeStore();
    const fallback = vi.fn(async () => route("adsblol-routeset"));
    const service = new EnrichmentService({
      flightRoute: { name: "adsbdb", getRoute: async () => null },
      flightRouteFallback: { name: "adsblol-routeset", getRoute: fallback },
    }, undefined, undefined, store);
    expect((await service.enrich(aircraft(), at))?.route?.source).toBe("adsblol-routeset");
    expect(store.put).toHaveBeenCalledWith(key, route("adsblol-routeset"), ENRICHMENT_TTLS.routeMs);
  });

  it("ignores a stored route outside the current geographic corridor", async () => {
    const far = { ...route(), origin: "OMDB", destination: "VHHH",
      originAirport: { icaoCode: "OMDB", iataCode: "DXB", name: "Dubai", city: "Dubai", country: "AE", latitude: 25.253, longitude: 55.365 },
      destinationAirport: { icaoCode: "VHHH", iataCode: "HKG", name: "Hong Kong", city: "Hong Kong", country: "HK", latitude: 22.308, longitude: 113.918 },
    };
    const store = fakeStore(async () => far);
    const primary = vi.fn(async () => route());
    const service = new EnrichmentService({ flightRoute: { name: "adsbdb", getRoute: primary } }, undefined, undefined, store);
    expect((await service.enrich(aircraft(), at))?.route?.origin).toBe("LKPR");
    expect(primary).toHaveBeenCalledOnce();
  });

  it("ignores PostgreSQL outages without blocking the free provider", async () => {
    const store = fakeStore(async () => { throw new Error("DB offline"); });
    const primary = vi.fn(async () => route());
    const service = new EnrichmentService({ flightRoute: { name: "adsbdb", getRoute: primary } }, undefined, undefined, store);
    expect((await service.enrich(aircraft(), at))?.route?.origin).toBe("LKPR");
    expect(primary).toHaveBeenCalledOnce();
  });

  it("rejects poisoned or malformed records before serving cache data", () => {
    const valid = route();
    expect(validPersistedRoute(valid)).toBe(true);
    expect(decodeCachedRoute(JSON.stringify(valid), key)).toEqual(valid);
    expect(decodeCachedRoute(JSON.stringify({ ...valid, callsign: "DIFFERENT" }), key)).toBeNull();
    expect(decodeCachedRoute(JSON.stringify({ ...valid, source: "flightaware-aeroapi" }), key)).toBeNull();
    expect(decodeCachedRoute(JSON.stringify({ ...valid, originAirport: null }), key)).toBeNull();
    expect(decodeCachedRoute("not-json", key)).toBeNull();
  });
});
