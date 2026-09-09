import type { Aircraft, AircraftEnrichment } from "@/lib/aircraft/types";
import type { ProviderRegistry } from "@/lib/server/provider";

export const ENRICHMENT_TTLS = {
  metadataMs: 24 * 60 * 60_000,
  metadataNegativeMs: 15 * 60_000,
  routeMs: 6 * 60 * 60_000,
  routeNegativeMs: 10 * 60_000,
  flightPlanMs: 15 * 60_000,
  flightPlanNegativeMs: 2 * 60_000,
} as const;

interface CacheEntry<T> {
  value: T | null;
  expiresAt: number;
}

interface CacheOptions {
  ttlMs: number;
  negativeTtlMs: number;
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

    const request = loader()
      .catch(() => null)
      .then((value) => {
        this.entries.set(key, {
          value,
          expiresAt: Date.now() + (value === null ? options.negativeTtlMs : options.ttlMs),
        });
        this.evictIfNeeded();
        return value;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });
    this.inFlight.set(key, request);
    return request;
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

export class EnrichmentService {
  private readonly metadataLimiter: ConcurrencyLimiter;
  private readonly routeLimiter: ConcurrencyLimiter;
  private readonly flightPlanLimiter = new ConcurrencyLimiter(2);

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

  get hasProviders(): boolean {
    return Boolean(this.providers.aircraftMetadata || this.providers.flightRoute || this.providers.flightPlan);
  }

  getDiagnostics(): { providerCacheEntries: number; providerCacheLimit: number; metadata: { hotCacheSize: number; hotCacheLimit: number; catalogRecordCount: number | null } | null } {
    const metadataProvider = this.providers.aircraftMetadata;
    const diagnostics = metadataProvider && "getDiagnostics" in metadataProvider && typeof metadataProvider.getDiagnostics === "function"
      ? metadataProvider.getDiagnostics() as { hotCacheSize: number; hotCacheLimit: number; catalogRecordCount: number | null }
      : null;
    return {
      providerCacheEntries: this.cache.size(),
      providerCacheLimit: this.cache.limit(),
      metadata: diagnostics,
    };
  }

  needsEnrichment(aircraft: Aircraft, existing: AircraftEnrichment | undefined): boolean {
    return Boolean(
      (this.providers.aircraftMetadata && !existing?.metadata)
      || (aircraft.callsign && this.providers.flightRoute && !existing?.route)
      || (aircraft.callsign && this.providers.flightPlan && !existing?.flightPlan),
    );
  }

  async enrich(aircraft: Aircraft, observedAt: Date): Promise<AircraftEnrichment | null> {
    if (!this.hasProviders) return null;
    const [metadata, route, flightPlan] = await Promise.all([
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
      aircraft.callsign && this.providers.flightPlan
        ? this.cache.get(flightPlanCacheKey(aircraft.callsign, observedAt), () => this.flightPlanLimiter.run(() => this.providers.flightPlan!.getFlightPlan(aircraft.callsign!, observedAt)), {
            ttlMs: ENRICHMENT_TTLS.flightPlanMs,
            negativeTtlMs: ENRICHMENT_TTLS.flightPlanNegativeMs,
          })
        : Promise.resolve(null),
    ]);

    const enrichment: AircraftEnrichment = {};
    if (metadata) enrichment.metadata = metadata;
    if (route) enrichment.route = route;
    if (flightPlan) enrichment.flightPlan = flightPlan;
    return Object.keys(enrichment).length ? enrichment : null;
  }
}
