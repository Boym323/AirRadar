import { describe, expect, it, vi } from "vitest";
import { ENRICHMENT_TTLS, EnrichmentService, ProviderCache, metadataCacheKey, routeCacheKey } from "@/lib/server/enrichment-cache";
import { normalizeAircraft } from "@/lib/aircraft/normalize";
import type { AircraftMetadata, FlightPlan, FlightRoute } from "@/lib/aircraft/types";

describe("provider enrichment cache", () => {
  function aircraft(hex: string, callsign: string) {
    const value = normalizeAircraft({ hex, flight: callsign, lat: 50, lon: 14 }, { lat: 50, lon: 14, name: "Test" });
    if (!value) throw new Error("test aircraft could not be normalized");
    return value;
  }

  function metadata(hex: string): AircraftMetadata {
    return {
      registration: `REG-${hex}`,
      registrationCountry: "Testland",
      registrationCountryCode: "TT",
      aircraftType: "A320",
      icaoTypeCode: "A320",
      aircraftDescription: "Airbus A320",
      operator: `Operator-${hex}`,
      manufacturer: "Airbus",
      source: "test",
      retrievedAt: new Date().toISOString(),
    };
  }

  function route(callsign: string, origin: string, destination: string): FlightRoute {
    return {
      callsign,
      airline: `Airline-${callsign}`,
      airlineIcao: null,
      airlineIata: null,
      origin,
      destination,
      originAirport: null,
      destinationAirport: null,
      source: "test",
      retrievedAt: new Date().toISOString(),
    };
  }

  it("coalesces concurrent calls and caches negative results", async () => {
    const cache = new ProviderCache();
    let calls = 0;
    const loader = async () => {
      calls += 1;
      await Promise.resolve();
      return null;
    };
    const options = { ttlMs: ENRICHMENT_TTLS.routeMs, negativeTtlMs: ENRICHMENT_TTLS.routeNegativeMs };
    await Promise.all([cache.get("route:test", loader, options), cache.get("route:test", loader, options)]);
    await cache.get("route:test", loader, options);
    expect(calls).toBe(1);
  });

  it("uses stable identity keys", () => {
    const date = new Date("2026-01-02T12:00:00Z");
    expect(metadataCacheKey("abc123")).toBe("aircraft-metadata:ABC123");
    expect(routeCacheKey(" test123 ", date)).toBe("flight-route:TEST123:2026-01-02");
  });

  it("does not call ADSBDB again for repeated realtime snapshots", async () => {
    const aircraft = normalizeAircraft({ hex: "abc123", flight: "TEST123", lat: 50, lon: 14 }, { lat: 50, lon: 14, name: "Test" });
    if (!aircraft) throw new Error("test aircraft could not be normalized");
    const getMetadata = vi.fn(async () => ({
      registration: "OK-ABC", registrationCountry: "Czech Republic", registrationCountryCode: "CZ",
      aircraftType: "A320", icaoTypeCode: "A320", aircraftDescription: "Airbus A320", operator: "Test Air",
      manufacturer: "Airbus", source: "adsbdb", retrievedAt: new Date().toISOString(),
    }));
    const getRoute = vi.fn(async () => null);
    const metadataProvider = { name: "adsbdb", getMetadata };
    const routeProvider = { name: "adsbdb", getRoute };
    const service = new EnrichmentService({ aircraftMetadata: metadataProvider, flightRoute: routeProvider });

    await Promise.all([service.enrich(aircraft, new Date("2026-01-01T00:00:00Z")), service.enrich(aircraft, new Date("2026-01-01T00:00:00Z"))]);
    await service.enrich(aircraft, new Date("2026-01-01T00:00:01Z"));

    expect(getMetadata).toHaveBeenCalledTimes(1);
    expect(getRoute).toHaveBeenCalledTimes(1);
  });

  it("keeps aircraft metadata separate for two hexes with the same callsign", async () => {
    const getMetadata = vi.fn(async (hex: string) => metadata(hex));
    const getRoute = vi.fn(async (callsign: string) => route(callsign, "OMDB", "LKPR"));
    const service = new EnrichmentService({
      aircraftMetadata: { name: "adsbdb", getMetadata },
      flightRoute: { name: "adsbdb", getRoute },
    });
    const observedAt = new Date("2026-01-01T12:00:00Z");

    const first = await service.enrich(aircraft("ABC123", "UAE139"), observedAt);
    const second = await service.enrich(aircraft("DEF456", "UAE139"), observedAt);

    expect(first?.metadata?.registration).toBe("REG-ABC123");
    expect(second?.metadata?.registration).toBe("REG-DEF456");
    expect(first?.metadata?.operator).not.toBe(second?.metadata?.operator);
    expect(first?.route).toMatchObject({ callsign: "UAE139", origin: "OMDB", destination: "LKPR" });
    expect(getMetadata).toHaveBeenCalledTimes(2);
    expect(getRoute).toHaveBeenCalledTimes(2);
  });

  it("keeps metadata on one hex when its callsign changes while refreshing route", async () => {
    const getMetadata = vi.fn(async (hex: string) => metadata(hex));
    const getRoute = vi.fn(async (callsign: string) => route(callsign, callsign === "OLD123" ? "LKPR" : "OMDB", "EDDF"));
    const service = new EnrichmentService({
      aircraftMetadata: { name: "adsbdb", getMetadata },
      flightRoute: { name: "adsbdb", getRoute },
    });

    const first = await service.enrich(aircraft("ABC123", "OLD123"), new Date("2026-01-01T12:00:00Z"));
    const second = await service.enrich(aircraft("ABC123", "NEW123"), new Date("2026-01-01T12:00:00Z"));

    expect(second?.metadata).toEqual(first?.metadata);
    expect(second?.route?.callsign).toBe("NEW123");
    expect(second?.route?.origin).toBe("OMDB");
    expect(getMetadata).toHaveBeenCalledTimes(1);
    expect(getRoute).toHaveBeenCalledTimes(2);
  });

  it("does not let a fixture hex join Royal Jet metadata to Emirates route data", async () => {
    const service = new EnrichmentService({
      aircraftMetadata: {
        name: "adsbdb",
        getMetadata: async (hex: string) => hex === "896139" ? {
          ...metadata(hex), registration: "A6-RJX", operator: "Royal Jet", manufacturer: "Boeing", aircraftType: "737NG 7AK/W BBJ", icaoTypeCode: "B737",
        } : null,
      },
      flightRoute: {
        name: "adsbdb",
        getRoute: async (callsign: string) => callsign === "UAE139" ? {
          ...route(callsign, "OMDB", "LKPR"), airline: "Emirates", airlineIcao: "UAE", airlineIata: "EK",
        } : null,
      },
    });

    const result = await service.enrich(aircraft("896139", "UAE139"), new Date("2026-01-01T12:00:00Z"));

    expect(result?.metadata).toMatchObject({ registration: "A6-RJX", manufacturer: "Boeing", operator: "Royal Jet" });
    expect(result?.route).toMatchObject({ airline: "Emirates", origin: "OMDB", destination: "LKPR" });
    expect(result?.metadata?.operator).not.toBe(result?.route?.airline);
  });

  it("rejects a callsign route whose airports are far from the live aircraft", async () => {
    const routeWithAirports: FlightRoute = {
      ...route("RYR3YV", "EIDW", "EGSS"),
      originAirport: { icaoCode: "EIDW", iataCode: "DUB", name: "Dublin", city: "Dublin", country: "IE", latitude: 53.4287, longitude: -6.2621 },
      destinationAirport: { icaoCode: "EGSS", iataCode: "STN", name: "Stansted", city: "London", country: "GB", latitude: 51.885, longitude: 0.235 },
    };
    const service = new EnrichmentService({
      flightRoute: { name: "adsbdb", getRoute: async () => routeWithAirports },
    });
    const aircraft = normalizeAircraft({ hex: "48c135", flight: "RYR3YV", lat: 49.49, lon: 17.63 }, { lat: 50, lon: 14, name: "Test" });
    if (!aircraft) throw new Error("test aircraft could not be normalized");

    await expect(service.enrich(aircraft, new Date("2026-09-12T11:20:00Z"))).resolves.toBeNull();
  });

  it("bounds concurrent lookups for different cache keys", async () => {
    let active = 0;
    let maximum = 0;
    const getMetadata = vi.fn(async (hex: string) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return metadata(hex);
    });
    const service = new EnrichmentService({ aircraftMetadata: { name: "adsbdb", getMetadata } });
    await Promise.all(Array.from({ length: 14 }, (_, index) => service.enrich(aircraft(`ABC${index.toString(16).padStart(3, "0")}`, `TEST${index}`), new Date("2026-01-01T12:00:00Z"))));
    expect(maximum).toBeLessThanOrEqual(6);
    expect(getMetadata).toHaveBeenCalledTimes(14);
  });

  it("shares the six-request ADSBDB budget between metadata and route lookups", async () => {
    let active = 0;
    let maximum = 0;
    const enterAndHold = async <T>(value: T): Promise<T> => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return value;
    };
    const getMetadata = vi.fn(async (hex: string) => enterAndHold(metadata(hex)));
    const getRoute = vi.fn(async (callsign: string) => enterAndHold(route(callsign, "OMDB", "LKPR")));
    const adsbDb = { name: "adsbdb", getMetadata, getRoute };
    const service = new EnrichmentService({ aircraftMetadata: adsbDb, flightRoute: adsbDb });

    await Promise.all(Array.from({ length: 14 }, (_, index) => service.enrich(
      aircraft(`ABC${index.toString(16).padStart(3, "0")}`, `TEST${index}`),
      new Date("2026-01-01T12:00:00Z"),
    )));

    expect(maximum).toBeLessThanOrEqual(6);
    expect(getMetadata).toHaveBeenCalledTimes(14);
    expect(getRoute).toHaveBeenCalledTimes(14);
  });

  it("never invokes the paid flight-plan provider from realtime enrichment", async () => {
    const getFlightPlan = vi.fn(async (): Promise<FlightPlan | null> => null);
    const service = new EnrichmentService({ flightPlan: { name: "flightaware", getFlightPlan } });

    expect(service.hasProviders).toBe(false);
    expect(service.hasFlightPlanProvider).toBe(true);
    expect(service.needsEnrichment(aircraft("DEF001", "PLAN1"), undefined)).toBe(false);
    expect(await service.enrich(aircraft("DEF001", "PLAN1"), new Date("2026-01-01T12:00:00Z"))).toBeNull();
    expect(getFlightPlan).not.toHaveBeenCalled();
  });

  it("keeps on-demand paid flight-plan lookups at two concurrent provider calls", async () => {
    let active = 0;
    let maximum = 0;
    const getFlightPlan = vi.fn(async (callsign: string): Promise<FlightPlan> => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return {
        callsign, scheduledDeparture: null, actualDeparture: null, scheduledArrival: null,
        estimatedArrival: null, filedRoute: null, waypoints: [], source: "flightaware", retrievedAt: new Date().toISOString(),
      };
    });
    const service = new EnrichmentService({ flightPlan: { name: "flightaware", getFlightPlan } });
    await Promise.all(Array.from({ length: 7 }, (_, index) => service.getFlightPlanOnDemand(
      aircraft(`DEF${index.toString(16).padStart(3, "0")}`, `PLAN${index}`),
      new Date("2026-01-01T12:00:00Z"),
    )));
    expect(maximum).toBeLessThanOrEqual(2);
    expect(getFlightPlan).toHaveBeenCalledTimes(7);
  });

  it("uses free ADSB.lol fallback for a missing ADSBDB route, and reuses its cache", async () => {
    const primary = vi.fn(async () => null);
    const fallback = vi.fn(async (callsign: string) => ({
      ...route(callsign, "LKPR", "LZIB"),
      originAirport: { icaoCode: "LKPR", iataCode: "PRG", name: "Prague", city: "Prague", country: "CZ", latitude: 50.1008, longitude: 14.26 },
      destinationAirport: { icaoCode: "LZIB", iataCode: "BTS", name: "Bratislava", city: "Bratislava", country: "SK", latitude: 48.17, longitude: 17.21 },
      source: "adsblol-routeset",
    }));
    const service = new EnrichmentService({
      flightRoute: { name: "adsbdb", getRoute: primary },
      flightRouteFallback: { name: "adsblol-routeset", getRoute: fallback },
    });
    const target = aircraft("ABC123", "CSA123");
    const at = new Date("2026-10-10T10:00:00Z");
    const one = await service.enrich(target, at);
    const two = await service.enrich(target, at);
    expect(one?.route?.source).toBe("adsblol-routeset");
    expect(two?.route?.source).toBe("adsblol-routeset");
    expect(primary).toHaveBeenCalledTimes(1);
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(fallback).toHaveBeenCalledWith("CSA123", at, { lat: 50, lon: 14 });
  });

  it("never consults the ADSB.lol fallback when the primary route is valid", async () => {
    const known = {
      ...route("CSA123", "LKPR", "LZIB"),
      originAirport: { icaoCode: "LKPR", iataCode: "PRG", name: "Prague", city: "Prague", country: "CZ", latitude: 50.1008, longitude: 14.26 },
      destinationAirport: { icaoCode: "LZIB", iataCode: "BTS", name: "Bratislava", city: "Bratislava", country: "SK", latitude: 48.17, longitude: 17.21 },
    };
    const fallback = vi.fn(async () => null);
    const service = new EnrichmentService({
      flightRoute: { name: "adsbdb", getRoute: async () => known },
      flightRouteFallback: { name: "adsblol-routeset", getRoute: fallback },
    });
    expect((await service.enrich(aircraft("ABC123", "CSA123"), new Date()))?.route).toEqual(known);
    expect(fallback).not.toHaveBeenCalled();
  });

  it("rejects geographically impossible fallback routes", async () => {
    const fallback = vi.fn(async (callsign: string) => ({
      ...route(callsign, "OMDB", "VHHH"),
      originAirport: { icaoCode: "OMDB", iataCode: "DXB", name: "Dubai", city: "Dubai", country: "AE", latitude: 25.253, longitude: 55.365 },
      destinationAirport: { icaoCode: "VHHH", iataCode: "HKG", name: "Hong Kong", city: "Hong Kong", country: "HK", latitude: 22.308, longitude: 113.918 },
    }));
    const service = new EnrichmentService({ flightRouteFallback: { name: "adsblol-routeset", getRoute: fallback } });
    await expect(service.enrich(aircraft("ABC123", "CSA123"), new Date())).resolves.toBeNull();
  });

  it("caches on-demand FlightAware results for six hours and negative results for thirty minutes", async () => {
    const getFlightPlan = vi.fn(async (callsign: string): Promise<FlightPlan> => ({
      callsign, scheduledDeparture: null, actualDeparture: null, scheduledArrival: null,
      estimatedArrival: null, filedRoute: "DCT VLM DCT", waypoints: ["VLM"], source: "flightaware", retrievedAt: new Date().toISOString(),
    }));
    const service = new EnrichmentService({ flightPlan: { name: "flightaware", getFlightPlan } });
    const target = aircraft("DEF123", "PLAN123");
    const observedAt = new Date("2026-01-01T12:00:00Z");

    const first = await service.getFlightPlanOnDemand(target, observedAt);
    const second = await service.getFlightPlanOnDemand(target, observedAt);

    expect(first).toEqual(second);
    expect(getFlightPlan).toHaveBeenCalledTimes(1);
    expect(service.getDiagnostics().flightPlan.cacheHits).toBe(1);
    expect(ENRICHMENT_TTLS.flightPlanMs).toBe(6 * 60 * 60_000);
    expect(ENRICHMENT_TTLS.flightPlanNegativeMs).toBe(30 * 60_000);
  });
});
