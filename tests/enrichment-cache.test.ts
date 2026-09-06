import { describe, expect, it, vi } from "vitest";
import { ENRICHMENT_TTLS, EnrichmentService, ProviderCache, metadataCacheKey, routeCacheKey } from "@/lib/server/enrichment-cache";
import { normalizeAircraft } from "@/lib/aircraft/normalize";

describe("provider enrichment cache", () => {
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
});
