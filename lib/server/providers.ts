import { getAdsbDbBaseUrl, getFlightAwareApiKey, getReceiverPosition, isAdsbDbEnabled, isAdsbLolEnabled, isReadsbConfigured, shouldUseSampleAtcData } from "@/lib/server/config";
import { AdsbLolProvider } from "@/lib/server/adsblol-provider";
import { LocalReadsbProvider } from "@/lib/server/local-readsb-provider";
import { MockReadsbProvider } from "@/lib/server/mock-readsb-provider";
import { EnrichmentService } from "@/lib/server/enrichment-cache";
import { AdsbDbProvider } from "@/lib/server/adsbdb-provider";
import { AircraftMetadataCatalog } from "@/lib/server/aircraft-metadata-catalog";
import { FlightAwareFlightPlanProvider } from "@/lib/server/flightaware-provider";
import type { AircraftMetadata, FlightRoute } from "@/lib/aircraft/types";
import type { AircraftMetadataDiagnostics, AircraftMetadataProvider, AircraftProvider, FlightRouteProvider, NetworkAircraftProvider, ProviderRegistry } from "@/lib/server/provider";
import { DatabaseAtcSectorProvider, getStoredAtcData, SAMPLE_ATC_SECTORS, SAMPLE_ATC_TRANSMITTERS, SampleAtcSectorProvider } from "@/lib/server/atc-data";
import type { AtcDataResponse } from "@/lib/atc/types";

export function createAircraftProvider(): AircraftProvider {
  const baseUrl = process.env.READSB_BASE_URL?.trim();
  return baseUrl
    ? new LocalReadsbProvider(baseUrl, getReceiverPosition())
    : new MockReadsbProvider(getReceiverPosition());
}

export function createNetworkAircraftProvider(): NetworkAircraftProvider {
  // Demo mode remains deterministic. Extended coverage is opt-in and only
  // starts when a real local receiver is configured.
  return new AdsbLolProvider(getReceiverPosition(), { enabled: isAdsbLolEnabled() && isReadsbConfigured() });
}

/** Combines metadata sources while keeping the first non-empty value per field. */
class CombinedMetadataProvider implements AircraftMetadataProvider {
  readonly name = "adsbdb+tar1090-db";

  constructor(private readonly providers: AircraftMetadataProvider[]) {}

  async getMetadata(icaoHex: string): Promise<AircraftMetadata | null> {
    const results = await Promise.allSettled(this.providers.map((provider) => provider.getMetadata(icaoHex)));
    const values = results
      .filter((result): result is PromiseFulfilledResult<AircraftMetadata | null> => result.status === "fulfilled")
      .map((result) => result.value)
      .filter((value): value is AircraftMetadata => value !== null);
    const first = values[0];
    if (!first) return null;

    const merged: AircraftMetadata = { ...first };
    for (const value of values.slice(1)) {
      for (const key of [
        "registration", "registrationCountry", "registrationCountryCode", "aircraftType",
        "icaoTypeCode", "aircraftDescription", "operator", "manufacturer", "flags", "year",
      ] as const) {
        if (merged[key] == null && value[key] != null) merged[key] = value[key];
      }
    }
    return merged;
  }

  getDiagnostics(): AircraftMetadataDiagnostics | null {
    for (const provider of this.providers) {
      const candidate = "getDiagnostics" in provider && typeof provider.getDiagnostics === "function"
        ? provider.getDiagnostics()
        : null;
      if (candidate && typeof candidate === "object"
        && typeof candidate.hotCacheSize === "number"
        && typeof candidate.hotCacheLimit === "number"
        && (candidate.catalogRecordCount === null || typeof candidate.catalogRecordCount === "number")) {
        return candidate as AircraftMetadataDiagnostics;
      }
    }
    return null;
  }
}

/** Keeps the shared ADSBDB metadata/route concurrency budget when both sources are enabled. */
class CombinedAdsbDbProvider implements AircraftMetadataProvider, FlightRouteProvider {
  readonly name = "adsbdb+tar1090-db";
  private readonly metadata: CombinedMetadataProvider;

  constructor(private readonly adsbDb: AdsbDbProvider, tar1090: AircraftMetadataCatalog) {
    this.metadata = new CombinedMetadataProvider([adsbDb, tar1090]);
  }

  getMetadata(icaoHex: string): Promise<AircraftMetadata | null> {
    return this.metadata.getMetadata(icaoHex);
  }

  getDiagnostics(): AircraftMetadataDiagnostics | null {
    return this.metadata.getDiagnostics();
  }

  getRoute(callsign: string, observedAt: Date): Promise<FlightRoute | null> {
    return this.adsbDb.getRoute(callsign, observedAt);
  }
}

/** External integrations are optional; the local tar1090 lookup needs no API key. */
export function createEnrichmentService(): EnrichmentService {
  const registry: ProviderRegistry = {};
  const readsbBaseUrl = process.env.READSB_BASE_URL?.trim();
  const adsbDb = isAdsbDbEnabled() ? new AdsbDbProvider(getAdsbDbBaseUrl()) : null;
  const tar1090Db = readsbBaseUrl ? new AircraftMetadataCatalog(readsbBaseUrl) : null;

  if (adsbDb && tar1090Db) {
    const combined = new CombinedAdsbDbProvider(adsbDb, tar1090Db);
    registry.aircraftMetadata = combined;
    registry.flightRoute = combined;
  } else if (adsbDb) {
    registry.aircraftMetadata = adsbDb;
    registry.flightRoute = adsbDb;
  } else if (tar1090Db) {
    registry.aircraftMetadata = tar1090Db;
  }
  const flightAwareApiKey = getFlightAwareApiKey();
  if (flightAwareApiKey) registry.flightPlan = new FlightAwareFlightPlanProvider(flightAwareApiKey);
  return new EnrichmentService(registry);
}

export function createAtcSectorProvider() {
  return shouldUseSampleAtcData() ? new SampleAtcSectorProvider() : new DatabaseAtcSectorProvider();
}

export async function getAtcData(): Promise<AtcDataResponse> {
  if (shouldUseSampleAtcData()) {
    return {
      sectors: SAMPLE_ATC_SECTORS,
      transmitters: SAMPLE_ATC_TRANSMITTERS,
      metadata: {
        status: "sample",
        source: "AirRadar sample data",
        sourceReference: "demo://airradar-sample-atc",
        effectiveDate: null,
        lastVerifiedAt: "2026-01-01T00:00:00.000Z",
        sectorCount: SAMPLE_ATC_SECTORS.length,
        transmitterCount: SAMPLE_ATC_TRANSMITTERS.length,
      },
    };
  }
  return await getStoredAtcData() ?? {
    sectors: [],
    transmitters: [],
    metadata: {
      status: "unavailable",
      source: null,
      sourceReference: null,
      effectiveDate: null,
      lastVerifiedAt: null,
      sectorCount: 0,
      transmitterCount: 0,
    },
  };
}
