import { getAdsbDbBaseUrl, getFlightAwareApiKey, getReceiverPosition, isAdsbDbEnabled } from "@/lib/server/config";
import { LocalReadsbProvider } from "@/lib/server/local-readsb-provider";
import { MockReadsbProvider } from "@/lib/server/mock-readsb-provider";
import type { AircraftProvider } from "@/lib/server/provider";
import { EnrichmentService } from "@/lib/server/enrichment-cache";
import { AdsbDbProvider } from "@/lib/server/adsbdb-provider";
import { FlightAwareFlightPlanProvider } from "@/lib/server/flightaware-provider";
import type { ProviderRegistry } from "@/lib/server/provider";

export function createAircraftProvider(): AircraftProvider {
  const baseUrl = process.env.READSB_BASE_URL?.trim();
  return baseUrl
    ? new LocalReadsbProvider(baseUrl, getReceiverPosition())
    : new MockReadsbProvider(getReceiverPosition());
}

/** Optional integrations are deliberately absent by default: the radar works without API keys. */
export function createEnrichmentService(): EnrichmentService {
  const registry: ProviderRegistry = {};
  if (isAdsbDbEnabled()) {
    const adsbDb = new AdsbDbProvider(getAdsbDbBaseUrl());
    registry.aircraftMetadata = adsbDb;
    registry.flightRoute = adsbDb;
  }
  const flightAwareApiKey = getFlightAwareApiKey();
  if (flightAwareApiKey) registry.flightPlan = new FlightAwareFlightPlanProvider(flightAwareApiKey);
  return new EnrichmentService(registry);
}
