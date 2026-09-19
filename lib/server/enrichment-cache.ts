import type { Aircraft, AircraftEnrichment, AircraftMetadata, FlightRoute } from "@/lib/aircraft/types";
import { distanceToGreatCircleSegmentKm } from "@/lib/geo";
import { getAdsbDbCacheFile } from "@/lib/server/config";
import { AdsbDbPersistence, disabledAdsbDbPersistence, type AdsbDbPersistenceDiagnostics } from "@/lib/server/adsbdb-persistence";
import type { AircraftMetadataDiagnostics, ProviderRegistry } from "@/lib/server/provider";
import { LRUCache } from "lru-cache";
import pLimit from "p-limit";
import { logger } from "@/lib/server/logger";

export const ENRICHMENT_TTLS = {
  metadataMs: 24 * 60 * 60_000,
  metadataNegativeMs: 15 * 60_000,
  routeMs: 6 * 60 * 60_000,
  routeNegativeMs: 10 * 60_000,
  flightPlanMs: 6 * 60 * 60_000,
  flightPlanNegativeMs: 30 * 60_000,
} as const;

const ADSBDB_RETRY_INITIAL_MS = 5_000;
const ADSBDB_RETRY_MAX_MS = 5 * 60_000;

/**
 * ADSBDB route lookups are keyed by callsign, while a callsign can be reused
 * for different flight instances. Keep a stale callsign match from appearing
 * as a live route when its airports are nowhere near the aircraft position.
 * Keep this deliberately tight: a callsign can be reused and ADSBDB can
 * return a scheduled/previous sector. A large tolerance would present that
 * stale airport pair as the live destination. When the aircraft is outside
 * this corridor, fail closed and let the UI show that no verified route is
 * available.
 */
export const MAX_ROUTE_POSITION_DEVIATION_KM = 100;

export function routeMatchesAircraftPosition(aircraft: Aircraft, route: NonNullable<AircraftEnrichment["route"]>): boolean {
  if (aircraft.lat === null || aircraft.lon === null || !route.originAirport || !route.destinationAirport) return true;

  const distanceKm = distanceToGreatCircleSegmentKm(
    route.originAirport.latitude,
    route.originAirport.longitude,
    route.destinationAirport.latitude,
    route.destinationAirport.longitude,
    aircraft.lat,
    aircraft.lon,
  );
  return distanceKm <= MAX_ROUTE_POSITION_DEVIATION_KM;
}

interface CacheEntry<T> {
  value: T | null;
  expiresAt: number;
}

interface CacheOptions {
  ttlMs: number;
  negativeTtlMs: number;
  /** Preserve legacy fail-soft behavior by default; on-demand paid providers may opt out. */
  cacheLoaderErrors?: boolean;
}

/** Small bounded TTL cache with negative caching and in-flight request coalescing. */
export class ProviderCache {
  private readonly entries: LRUCache<string, CacheEntry<unknown>>;
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly maxEntries: number;

  constructor(maxEntries = 10_000) {
    this.maxEntries = maxEntries;
    this.entries = new LRUCache({ max: maxEntries });
  }

  async get<T>(key: string, loader: () => Promise<T | null>, options: CacheOptions): Promise<T | null> {
    const now = Date.now();
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > now) return cached.value as T | null;
    if (cached) this.entries.delete(key);

    const existing = this.inFlight.get(key);
    if (existing) return existing as Promise<T | null>;

    const store = (value: T | null): T | null => {
      this.entries.set(key, {
        value,
        expiresAt: Date.now() + (value === null ? options.negativeTtlMs : options.ttlMs),
      });
      return value;
    };

    const request = loader()
      .then(store)
      .catch((error) => {
        if (options.cacheLoaderErrors === false) throw error;
        return store(null);
      })
      .finally(() => {
        this.inFlight.delete(key);
      });
    this.inFlight.set(key, request);
    return request;
  }

  hasFreshOrPending(key: string): boolean {
    const now = Date.now();
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > now) return true;
    if (cached) this.entries.delete(key);
    return this.inFlight.has(key);
  }

  clear(): void {
    this.entries.clear();
    this.inFlight.clear();
  }

  /** Hydrates a positive value without creating an in-flight/request state. */
  hydrate<T>(key: string, value: T, expiresAt: number): void {
    if (expiresAt <= Date.now()) return;
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt });
  }

  count(prefix: string): number {
    return [...this.entries.keys()].filter((key) => key.startsWith(prefix)).length;
  }

  size(): number {
    return this.entries.size;
  }

  limit(): number {
    return this.maxEntries;
  }

}

function normalizeHex(hex: string): string {
  return hex.trim().toUpperCase();
}

function normalizeCallsign(callsign: string): string {
  return callsign.trim().toUpperCase();
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function metadataCacheKey(icaoHex: string): string {
  return `aircraft-metadata:${normalizeHex(icaoHex)}`;
}

export function routeCacheKey(callsign: string, observedAt: Date, icaoHex?: string): string {
  const aircraftIdentity = icaoHex ? `${normalizeHex(icaoHex)}:` : "";
  return `flight-route:${aircraftIdentity}${normalizeCallsign(callsign)}:${dayKey(observedAt)}`;
}

export function flightPlanCacheKey(callsign: string, observedAt: Date): string {
  return `flight-plan:${normalizeCallsign(callsign)}:${dayKey(observedAt)}`;
}

interface FlightPlanProviderDiagnostics {
  requests: number;
  failures: number;
  rateLimited: number;
  limitPerMinute: number;
  windowMs: number;
  providerState?: string;
}

function getFlightPlanProviderDiagnostics(provider: ProviderRegistry["flightPlan"]): FlightPlanProviderDiagnostics | null {
  if (!provider || !("getDiagnostics" in provider)) return null;
  const getDiagnostics = (provider as typeof provider & { getDiagnostics?: () => unknown }).getDiagnostics;
  if (typeof getDiagnostics !== "function") return null;
  const candidate = getDiagnostics.call(provider);
  if (!candidate || typeof candidate !== "object") return null;
  const value = candidate as Partial<FlightPlanProviderDiagnostics>;
  if (
    typeof value.requests !== "number"
    || typeof value.failures !== "number"
    || typeof value.rateLimited !== "number"
    || typeof value.limitPerMinute !== "number"
    || typeof value.windowMs !== "number"
  ) return null;
  return value as FlightPlanProviderDiagnostics;
}

export class EnrichmentService {
  private readonly metadataLimiter: ReturnType<typeof pLimit>;
  private readonly routeLimiter: ReturnType<typeof pLimit>;
  private readonly flightPlanLimiter = pLimit(2);
  private flightPlanCacheHits = 0;
  private readonly adsbDbPersistence: AdsbDbPersistence | null;
  private readonly adsbDbHits = { memory: 0, persistent: 0, live: 0, staleFallback: 0 };
  private readonly staleFallbackLogged = new Set<string>();
  private adsbDbRetryAt = 0;
  private adsbDbFailureStreak = 0;

  constructor(
    private readonly providers: ProviderRegistry,
    private readonly cache = new ProviderCache(),
    adsbDbPersistence?: AdsbDbPersistence,
  ) {
    // The factory supplies one AdsbDbProvider instance for both capabilities.
    // Sharing only that instance's limiter keeps future provider combinations independent.
    const sharedAdsbDbLimiter = providers.aircraftMetadata
      && providers.flightRoute
      && (providers.aircraftMetadata as object) === (providers.flightRoute as object)
      ? pLimit(6)
      : null;
    this.metadataLimiter = sharedAdsbDbLimiter ?? pLimit(6);
    this.routeLimiter = sharedAdsbDbLimiter ?? pLimit(6);
    this.adsbDbPersistence = adsbDbPersistence ?? null;
    for (const kind of ["metadata", "route"] as const) {
      for (const entry of this.adsbDbPersistence?.hydrateEntries(kind) ?? []) {
        this.cache.hydrate(entry.key, entry.value, entry.freshUntilMs);
      }
    }
  }

  /** Providers safe for continuous live-snapshot enrichment. */
  get hasProviders(): boolean {
    return Boolean(this.providers.aircraftMetadata || this.providers.flightRoute);
  }

  get hasFlightPlanProvider(): boolean {
    return Boolean(this.providers.flightPlan);
  }

  getDiagnostics(): {
    providerCacheEntries: number;
    providerCacheLimit: number;
    metadata: AircraftMetadataDiagnostics | null;
    adsbdb: {
      providerStatus: "online" | "degraded" | "offline" | "unknown";
      lastSuccessAt: string | null;
      lastFailureAt: string | null;
      consecutiveFailures: number;
      memory: { metadataEntries: number; routeEntries: number };
      persistence: AdsbDbPersistenceDiagnostics;
      hits: { memory: number; persistent: number; live: number; staleFallback: number };
    };
    flightPlan: {
      enabled: boolean;
      cacheHits: number;
      provider: FlightPlanProviderDiagnostics | null;
    };
  } {
    const metadataProvider = this.providers.aircraftMetadata;
    const candidate = metadataProvider && "getDiagnostics" in metadataProvider && typeof metadataProvider.getDiagnostics === "function"
      ? metadataProvider.getDiagnostics()
      : null;
    const diagnostics = candidate && typeof candidate === "object"
      && typeof candidate.hotCacheSize === "number"
      && typeof candidate.hotCacheLimit === "number"
      && (candidate.catalogRecordCount === null || typeof candidate.catalogRecordCount === "number")
      ? candidate as AircraftMetadataDiagnostics
      : null;
    const providerDiagnostics = this.getAdsbDbProviderDiagnostics();
    return {
      providerCacheEntries: this.cache.size(),
      providerCacheLimit: this.cache.limit(),
      metadata: diagnostics,
      adsbdb: {
        providerStatus: providerDiagnostics?.providerStatus ?? "unknown",
        lastSuccessAt: providerDiagnostics?.lastSuccessAt ?? null,
        lastFailureAt: providerDiagnostics?.lastFailureAt ?? null,
        consecutiveFailures: providerDiagnostics?.consecutiveFailures ?? 0,
        memory: {
          metadataEntries: this.cache.count("aircraft-metadata:"),
          routeEntries: this.cache.count("flight-route:"),
        },
        persistence: this.adsbDbPersistence?.getDiagnostics() ?? disabledAdsbDbPersistence(getAdsbDbCacheFile()),
        hits: { ...this.adsbDbHits },
      },
      flightPlan: {
        enabled: this.hasFlightPlanProvider,
        cacheHits: this.flightPlanCacheHits,
        provider: getFlightPlanProviderDiagnostics(this.providers.flightPlan),
      },
    };
  }

  needsEnrichment(aircraft: Aircraft, existing: AircraftEnrichment | undefined): boolean {
    return Boolean(
      (this.providers.aircraftMetadata && !existing?.metadata)
      || (aircraft.callsign && this.providers.flightRoute && !existing?.route),
    );
  }

  /**
   * Continuous enrichment intentionally excludes paid flight-plan providers.
   * FlightAware is invoked only through getFlightPlanOnDemand().
   */
  async enrich(aircraft: Aircraft, observedAt: Date): Promise<AircraftEnrichment | null> {
    if (!this.hasProviders) return null;
    const [metadata, route] = await Promise.all([
      this.providers.aircraftMetadata
        ? this.getAdsbDbCached("metadata", metadataCacheKey(aircraft.icaoHex), () => this.metadataLimiter(() => this.providers.aircraftMetadata!.getMetadata(aircraft.icaoHex)), {
            ttlMs: ENRICHMENT_TTLS.metadataMs,
            negativeTtlMs: ENRICHMENT_TTLS.metadataNegativeMs,
          })
        : Promise.resolve(null),
      aircraft.callsign && this.providers.flightRoute
        ? this.getAdsbDbCached("route", routeCacheKey(aircraft.callsign, observedAt, aircraft.icaoHex), () => this.routeLimiter(() => this.providers.flightRoute!.getRoute(aircraft.callsign!, observedAt)), {
            ttlMs: ENRICHMENT_TTLS.routeMs,
            negativeTtlMs: ENRICHMENT_TTLS.routeNegativeMs,
          }).then((route) => route && routeMatchesAircraftPosition(aircraft, route) ? route : null)
        : Promise.resolve(null),
    ]);

    const enrichment: AircraftEnrichment = {};
    if (metadata) enrichment.metadata = metadata;
    if (route) enrichment.route = route;
    return Object.keys(enrichment).length ? enrichment : null;
  }

  /** Paid provider lookup used only by explicit aircraft-detail requests. */
  async getFlightPlanOnDemand(
    aircraft: Aircraft,
    observedAt: Date,
  ): Promise<NonNullable<AircraftEnrichment["flightPlan"]> | null> {
    const provider = this.providers.flightPlan;
    const callsign = aircraft.callsign?.trim();
    if (!provider || !callsign) return null;

    const key = flightPlanCacheKey(callsign, observedAt);
    if (this.cache.hasFreshOrPending(key)) this.flightPlanCacheHits += 1;

    try {
      return await this.cache.get(
        key,
        () => this.flightPlanLimiter(() => provider.getFlightPlan(callsign, observedAt)),
        {
          ttlMs: ENRICHMENT_TTLS.flightPlanMs,
          negativeTtlMs: ENRICHMENT_TTLS.flightPlanNegativeMs,
          // A local/upstream rate-limit or network failure must not poison the
          // 30-minute negative cache. True null provider results are cached.
          cacheLoaderErrors: false,
        },
      );
    } catch {
      return null;
    }
  }

  async close(): Promise<void> {
    await this.adsbDbPersistence?.flush();
  }

  private async getAdsbDbCached<T extends AircraftEnrichment["metadata"] | AircraftEnrichment["route"]>(
    kind: "metadata" | "route",
    key: string,
    loader: () => Promise<T | null>,
    options: CacheOptions,
  ): Promise<T | null> {
    const isAdsbDb = this.adsbDbPersistence !== null;
    const pendingOrFresh = this.cache.hasFreshOrPending(key);
    if (isAdsbDb && !pendingOrFresh) {
      const persisted = this.adsbDbPersistence!.get(kind, key);
      if (persisted?.fresh) {
        this.cache.hydrate(key, persisted.value as T, persisted.fetchedAtMs + options.ttlMs);
        this.adsbDbHits.persistent += 1;
        return persisted.value as T;
      }
    }
    if (isAdsbDb && pendingOrFresh) this.adsbDbHits.memory += 1;

    // Do not hammer an unavailable upstream once per aircraft and poll cycle.
    // A stale persisted value is still eligible below as a fail-soft fallback.
    if (isAdsbDb && this.adsbDbRetryAt > Date.now()) {
      const stale = this.adsbDbPersistence!.get(kind, key);
      if (stale && !stale.fresh) {
        this.adsbDbHits.staleFallback += 1;
        return stale.value as T;
      }
      return null;
    }

    try {
      const value = await this.cache.get(key, async () => {
        if (isAdsbDb) this.adsbDbHits.live += 1;
        return loader();
      }, { ...options, ...(isAdsbDb ? { cacheLoaderErrors: false } : {}) });
      if (isAdsbDb && value !== null) {
        const source = (value as { source?: unknown }).source;
        if (source === "adsbdb") {
          this.adsbDbPersistence!.set(kind, key, value as AircraftMetadata | FlightRoute);
          this.staleFallbackLogged.delete(`${kind}:${key}`);
        }
        // A local tar1090/PostgreSQL fallback is not evidence that ADSBDB
        // returned a miss. Keep the last-known-good ADSBDB value available if
        // the local source becomes unavailable later.
      } else if (isAdsbDb && value === null) {
        // A valid provider miss must not revive an older route/metadata value.
        this.adsbDbPersistence!.delete(kind, key);
        this.staleFallbackLogged.delete(`${kind}:${key}`);
      }
      if (isAdsbDb) {
        this.adsbDbFailureStreak = 0;
        this.adsbDbRetryAt = 0;
      }
      return value as T | null;
    } catch {
      if (isAdsbDb) {
        this.adsbDbFailureStreak += 1;
        const retryMs = Math.min(
          ADSBDB_RETRY_MAX_MS,
          ADSBDB_RETRY_INITIAL_MS * 2 ** Math.min(this.adsbDbFailureStreak - 1, 10),
        );
        this.adsbDbRetryAt = Date.now() + retryMs;
      }
      const stale = isAdsbDb ? this.adsbDbPersistence!.get(kind, key) : null;
      if (stale && !stale.fresh) {
        this.adsbDbHits.staleFallback += 1;
        const logKey = `${kind}:${key}`;
        if (!this.staleFallbackLogged.has(logKey)) {
          this.staleFallbackLogged.add(logKey);
          logger.warn({ subsystem: "adsbdb", kind, ageMs: Math.max(0, Date.now() - stale.fetchedAtMs) }, "Provider unavailable; using stale cache");
        }
        return stale.value as T;
      }
      return null;
    }
  }

  private getAdsbDbProviderDiagnostics(): {
    providerStatus: "online" | "degraded" | "offline";
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    consecutiveFailures: number;
  } | null {
    const providers = [this.providers.aircraftMetadata, this.providers.flightRoute];
    for (const provider of providers) {
      if (!provider || !("getAdsbDbDiagnostics" in provider)) continue;
      const candidate = (provider as typeof provider & { getAdsbDbDiagnostics?: () => unknown }).getAdsbDbDiagnostics?.();
      if (!candidate || typeof candidate !== "object") continue;
      const value = candidate as Record<string, unknown>;
      if ((value.providerStatus === "online" || value.providerStatus === "degraded" || value.providerStatus === "offline")
        && (value.lastSuccessAt === null || typeof value.lastSuccessAt === "string")
        && (value.lastFailureAt === null || typeof value.lastFailureAt === "string")
        && typeof value.consecutiveFailures === "number") {
        return value as {
          providerStatus: "online" | "degraded" | "offline";
          lastSuccessAt: string | null;
          lastFailureAt: string | null;
          consecutiveFailures: number;
        };
      }
    }
    return null;
  }
}
