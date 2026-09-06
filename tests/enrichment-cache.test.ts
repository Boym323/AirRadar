import { describe, expect, it, vi } from "vitest";
import { ENRICHMENT_TTLS, EnrichmentService, ProviderCache, metadataCacheKey, routeCacheKey } from "@/lib/server/enrichment-cache";
import { normalizeAircraft } from "@/lib/aircraft/normalize";
import type { AircraftMetadata, FlightRoute } from "@/lib/aircraft/types";

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
    expect(first?.route).toEqual(second?.route);
    expect(getMetadata).toHaveBeenCalledTimes(2);
    expect(getRoute).toHaveBeenCalledTimes(1);
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
});
