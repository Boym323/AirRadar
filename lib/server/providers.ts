import { getReceiverPosition } from "@/lib/server/config";
import { LocalReadsbProvider } from "@/lib/server/local-readsb-provider";
import { MockReadsbProvider } from "@/lib/server/mock-readsb-provider";
import type { AircraftProvider } from "@/lib/server/provider";
import { EnrichmentService } from "@/lib/server/enrichment-cache";

export function createAircraftProvider(): AircraftProvider {
  const baseUrl = process.env.READSB_BASE_URL?.trim();
  return baseUrl
    ? new LocalReadsbProvider(baseUrl, getReceiverPosition())
    : new MockReadsbProvider(getReceiverPosition());
}

/** Optional integrations are deliberately absent by default: the radar works without API keys. */
export function createEnrichmentService(): EnrichmentService {
  return new EnrichmentService({});
}
