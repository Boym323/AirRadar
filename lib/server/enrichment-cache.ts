import type { Aircraft, AircraftEnrichment } from "@/lib/aircraft/types";
import type { AircraftMetadataDiagnostics, ProviderRegistry } from "@/lib/server/provider";

export const ENRICHMENT_TTLS = {
  metadataMs: 24 * 60 * 60_000,
  metadataNegativeMs: 15 * 60_000,
  routeMs: 6 * 60 * 60_000,
  routeNegativeMs: 10 * 60_000,
  flightPlanMs: 6 * 60 * 60_000,
  flightPlanNegativeMs: 30 * 60_000,
} as const;

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

/** Runs different provider keys in parallel only up to the provider budget. */
export class ConcurrencyLimiter {
  private active = 0;
  private readonly queue: Array<{
    task: () => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
  }> = [];

  constructor(private readonly limit: number) {}

  run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ task, resolve: resolve as (value: unknown) => void, reject });
      this.drain();
    });
  }

  private drain(): void {
    while (this.active < this.limit && this.queue.length) {
      const entry = this.queue.shift();
      if (!entry) return;
      this.active += 1;
      void entry.task()
        .then(entry.resolve, entry.reject)
        .finally(() => {
          this.active -= 1;
          this.drain();
        });
    }
  }
}

/** Small bounded TTL cache with negative caching and in-flight request coalescing. */
export class ProviderCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(private readonly maxEntries = 10_000) {}

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
      this.evictIfNeeded();
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

  size(): number {
    return this.entries.size;
  }

  limit(): number {
    return this.maxEntries;
  }

  private evictIfNeeded(): void {
    if (this.entries.size <= this.maxEntries) return;
    const oldest = this.entries.keys().next().value;
    if (oldest !== undefined) this.entries.delete(oldest);
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

export function routeCacheKey(callsign: string, observedAt: Date): string {
  return `flight-route:${normalizeCallsign(callsign)}:${dayKey(observedAt)}`;
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
  private readonly metadataLimiter: ConcurrencyLimiter;
  private readonly routeLimiter: ConcurrencyLimiter;
  private readonly flightPlanLimiter = new ConcurrencyLimiter(2);
  private flightPlanCacheHits = 0;

  constructor(
    private readonly providers: ProviderRegistry,
    private readonly cache = new ProviderCache(),
  ) {
    // The factory supplies one AdsbDbProvider instance for both capabilities.
    // Sharing only that instance's limiter keeps future provider combinations independent.
    const sharedAdsbDbLimiter = providers.aircraftMetadata
      && providers.flightRoute
      && (providers.aircraftMetadata as object) === (providers.flightRoute as object)
      ? new ConcurrencyLimiter(6)
      : null;
    this.metadataLimiter = sharedAdsbDbLimiter ?? new ConcurrencyLimiter(6);
    this.routeLimiter = sharedAdsbDbLimiter ?? new ConcurrencyLimiter(6);
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
    return {
      providerCacheEntries: this.cache.size(),
      providerCacheLimit: this.cache.limit(),
      metadata: diagnostics,
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
        ? this.cache.get(metadataCacheKey(aircraft.icaoHex), () => this.metadataLimiter.run(() => this.providers.aircraftMetadata!.getMetadata(aircraft.icaoHex)), {
            ttlMs: ENRICHMENT_TTLS.metadataMs,
            negativeTtlMs: ENRICHMENT_TTLS.metadataNegativeMs,
          })
        : Promise.resolve(null),
      aircraft.callsign && this.providers.flightRoute
        ? this.cache.get(routeCacheKey(aircraft.callsign, observedAt), () => this.routeLimiter.run(() => this.providers.flightRoute!.getRoute(aircraft.callsign!, observedAt)), {
            ttlMs: ENRICHMENT_TTLS.routeMs,
            negativeTtlMs: ENRICHMENT_TTLS.routeNegativeMs,
          })
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
        () => this.flightPlanLimiter.run(() => provider.getFlightPlan(callsign, observedAt)),
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
}
