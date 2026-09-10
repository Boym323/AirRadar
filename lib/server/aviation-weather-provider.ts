import type {
  AirportWeather,
  AviationSigmet,
  FlightCategory,
  MetarCloudLayer,
  MetarObservation,
  SigmetGeometry,
  SigmetSnapshot,
  TafCloudLayer,
  TafForecast,
  TafPeriod,
} from "@/lib/weather/types";
import { getAviationWeatherBaseUrl, getAviationWeatherMetarTtlMs, getAviationWeatherRequestTimeoutMs, getAviationWeatherSigmetTtlMs, getAviationWeatherStaleIfErrorMs, getAviationWeatherTafTtlMs, getAviationWeatherUserAgent } from "@/lib/server/config";
import { deriveFlightCategory } from "@/lib/weather/flight-category";

export const AVIATION_WEATHER_BASE_URL = "https://aviationweather.gov";
export const AVIATION_WEATHER_USER_AGENT = getAviationWeatherUserAgent();

export const AVIATION_WEATHER_TTLS = {
  metarMs: 5 * 60_000,
  tafMs: 10 * 60_000,
  sigmetMs: 5 * 60_000,
  staleMs: 30 * 60_000,
  maxAirports: 256,
  timeoutMs: 5_000,
} as const;

type Product = "metar" | "taf" | "sigmet";

interface CacheEntry<T> {
  value: T | null;
  fetchedAt: number;
  freshUntil: number;
  staleUntil: number;
}

interface ProductResult<T> {
  value: T | null;
  stale: boolean;
  failed: boolean;
}

interface ProductCacheOptions {
  ttlMs: number;
  staleIfErrorMs?: number;
}

/** Bounded product cache with negative entries and in-flight coalescing. */
export class AviationWeatherCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  private readonly airportOrder = new Map<string, number>();
  private readonly inFlight = new Map<string, Promise<ProductResult<unknown>>>();
  private hits = 0;
  private misses = 0;

  constructor(
    private readonly maxAirports: number = AVIATION_WEATHER_TTLS.maxAirports,
    private readonly defaultStaleIfErrorMs: number = AVIATION_WEATHER_TTLS.staleMs,
    private readonly clock: () => number = Date.now,
  ) {}

  async get<T>(
    product: Product,
    keyPart: string,
    loader: () => Promise<T | null>,
    options: ProductCacheOptions,
    now = Date.now(),
    onFailure?: (error: unknown) => void,
  ): Promise<ProductResult<T>> {
    const key = `${product}:${keyPart}`;
    const cached = this.entries.get(key) as CacheEntry<T> | undefined;
    if (cached && cached.freshUntil > now) {
      this.hits += 1;
      this.touchAirport(product, keyPart, now);
      return { value: cached.value, stale: false, failed: false };
    }

    const existing = this.inFlight.get(key);
    if (existing) {
      this.hits += 1;
      return existing as Promise<ProductResult<T>>;
    }

    this.misses += 1;
    const request = loader()
      .then((value) => {
        const fetchedAt = this.clock();
        this.entries.set(key, {
          value,
          fetchedAt,
          freshUntil: fetchedAt + options.ttlMs,
          staleUntil: fetchedAt + (options.ttlMs + (options.staleIfErrorMs ?? this.defaultStaleIfErrorMs)),
        });
        this.touchAirport(product, keyPart, fetchedAt);
        this.evictIfNeeded();
        return { value, stale: false, failed: false } satisfies ProductResult<T>;
      })
      .catch((error: unknown) => {
        onFailure?.(error);
        const stale = this.entries.get(key) as CacheEntry<T> | undefined;
        const staleNow = this.clock();
        if (stale && stale.value !== null && stale.staleUntil > staleNow) {
          this.touchAirport(product, keyPart, staleNow);
          return { value: stale.value, stale: true, failed: false } satisfies ProductResult<T>;
        }
        if (stale && stale.staleUntil <= staleNow) {
          this.entries.delete(key);
          if (product === "metar" || product === "taf") this.recomputeAirportOrder(keyPart);
        }
        return { value: null, stale: false, failed: true } satisfies ProductResult<T>;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });
    this.inFlight.set(key, request as Promise<ProductResult<unknown>>);
    return request;
  }

  size(): number { return this.entries.size; }

  airportCount(): number { return this.airportOrder.size; }

  productEntries(product: Product): number {
    let count = 0;
    for (const key of this.entries.keys()) if (key.startsWith(`${product}:`)) count += 1;
    return count;
  }

  fetchedAt(product: Product, keyPart: string): number | null {
    return (this.entries.get(`${product}:${keyPart}`) as CacheEntry<unknown> | undefined)?.fetchedAt ?? null;
  }

  stats(): { hits: number; misses: number } {
    return { hits: this.hits, misses: this.misses };
  }

  clear(): void {
    this.entries.clear();
    this.airportOrder.clear();
    this.inFlight.clear();
    this.hits = 0;
    this.misses = 0;
  }

  private touchAirport(product: Product, keyPart: string, now: number): void {
    if (product !== "metar" && product !== "taf") return;
    this.airportOrder.delete(keyPart);
    this.airportOrder.set(keyPart, now);
  }

  private recomputeAirportOrder(icaoCode: string): void {
    if (this.entries.has(`metar:${icaoCode}`) || this.entries.has(`taf:${icaoCode}`)) return;
    this.airportOrder.delete(icaoCode);
  }

  private evictIfNeeded(): void {
    while (this.airportOrder.size > this.maxAirports) {
      const oldest = this.airportOrder.keys().next().value;
      if (oldest === undefined) return;
      this.airportOrder.delete(oldest);
      this.entries.delete(`metar:${oldest}`);
      this.entries.delete(`taf:${oldest}`);
    }
  }
}

export class AviationWeatherUnavailableError extends Error {
  constructor() {
    super("Aviation weather provider unavailable");
    this.name = "AviationWeatherUnavailableError";
  }
}

export class AviationWeatherRateLimitError extends Error {
  constructor(public readonly retryAfterMs: number | null) {
    super("Aviation weather provider rate limited");
    this.name = "AviationWeatherRateLimitError";
  }
}

export interface AviationWeatherDiagnostics {
  enabled: boolean;
  status: "disabled" | "online" | "degraded" | "rate_limited" | "offline";
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastLatencyMs: number | null;
  requests: number;
  failures: number;
  consecutiveFailures: number;
  cacheHits: number;
  cacheMisses: number;
  metarEntries: number;
  tafEntries: number;
  activeSigmets: number;
  sigmetStale: boolean;
  retryAfterMs: number | null;
}

export interface AviationWeatherProviderOptions {
  fetcher?: typeof fetch;
  cache?: AviationWeatherCache;
  timeoutMs?: number;
  now?: () => number;
  baseUrl?: string;
  userAgent?: string;
  enabled?: boolean;
  metarTtlMs?: number;
  tafTtlMs?: number;
  sigmetTtlMs?: number;
  staleIfErrorMs?: number;
  maxAirports?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? number : null;
}

function altitudeFeet(value: unknown): number | null {
  const numeric = numberValue(value);
  if (numeric !== null) return numeric;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  const flightLevel = normalized.match(/^FL\s*(\d{2,3})$/);
  if (flightLevel) return Number(flightLevel[1]) * 100;
  const feet = normalized.match(/^(\d+(?:\.\d+)?)\s*FT$/);
  return feet ? Number(feet[1]) : null;
}

function validCoordinate(value: unknown, minimum: number, maximum: number): number | null {
  const number = numberValue(value);
  return number !== null && number >= minimum && number <= maximum ? number : null;
}

function isoDate(value: unknown): string | null {
  const date = typeof value === "number" && Number.isFinite(value)
    ? new Date(value * 1000)
    : typeof value === "string" && value.trim()
      ? new Date(value)
      : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

function normalizedCategory(value: unknown): FlightCategory | null {
  const category = stringValue(value)?.toUpperCase();
  return category === "VFR" || category === "MVFR" || category === "IFR" || category === "LIFR" ? category : null;
}

export function normalizeWeatherIcao(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{4}$/.test(normalized) ? normalized : null;
}

/** AviationWeather returns statute miles; AirRadar keeps visibility in meters. */
export function statuteMilesToMeters(value: number): number { return Math.round(value * 1609.344); }

function visibility(value: unknown): Pick<MetarObservation, "visibilityMeters" | "visibilityGreaterThan" | "visibilityLessThan"> {
  const raw = typeof value === "string" ? value.trim().toUpperCase() : value;
  const greaterThan = typeof raw === "string" && (raw.endsWith("+") || raw.startsWith("P"));
  const lessThan = typeof raw === "string" && raw.startsWith("M");
  const rawNumber = typeof raw === "string" ? raw.replace(/^[MP]/, "").replace(/\+$/, "").replace(/SM$/, "") : raw;
  const numeric = typeof rawNumber === "string" && rawNumber.includes("/")
    ? (() => {
      const [numerator, denominator] = rawNumber.split("/").map(Number);
      return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0 ? numerator / denominator : null;
    })()
    : typeof rawNumber === "string" ? numberValue(rawNumber) : numberValue(rawNumber);
  return {
    visibilityMeters: numeric !== null && numeric >= 0 ? statuteMilesToMeters(numeric) : null,
    visibilityGreaterThan: greaterThan,
    visibilityLessThan: lessThan,
  };
}

function cloudLayers(value: unknown): MetarCloudLayer[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const cover = stringValue(candidate.cover);
    if (!cover) return [];
    return [{
      cover: cover.toUpperCase(),
      baseFtAgl: numberValue(candidate.base),
      topFtAgl: numberValue(candidate.top),
    }];
  });
}

function tafCloudLayers(value: unknown): TafCloudLayer[] {
  return cloudLayers(value) as TafCloudLayer[];
}

function weatherTokens(value: unknown): string[] {
  const text = stringValue(value);
  return text ? text.split(/\s+/).filter(Boolean).slice(0, 12) : [];
}

function mapMetar(payload: unknown, icaoCode: string): MetarObservation | null {
  if (!Array.isArray(payload)) throw new Error("METAR response is not an array");
  if (payload.length === 0) return null;
  const record = payload.find((candidate) => isRecord(candidate) && stringValue(candidate.icaoId)?.toUpperCase() === icaoCode);
  if (!record || !isRecord(record)) throw new Error("METAR response did not contain the requested airport");
  const direction = record.wdir;
  const numericDirection = numberValue(direction);
  const clouds = cloudLayers(record.clouds);
  const visibilityData = visibility(record.visib);
  const observedAt = isoDate(record.reportTime) ?? isoDate(record.obsTime);
  return {
    stationId: icaoCode,
    rawText: stringValue(record.rawOb),
    observationTime: observedAt,
    observedAt,
    temperatureC: numberValue(record.temp),
    dewpointC: numberValue(record.dewp),
    windDirectionDeg: numericDirection !== null && numericDirection >= 0 ? numericDirection : null,
    windVariable: typeof direction === "string" && direction.trim().toUpperCase() === "VRB",
    windSpeedKt: numberValue(record.wspd),
    windGustKt: numberValue(record.wgst),
    ...visibilityData,
    altimeterHpa: numberValue(record.altim),
    flightCategory: normalizedCategory(record.fltCat),
    clouds,
    weather: weatherTokens(record.wxString),
    latitude: validCoordinate(record.lat, -90, 90),
    longitude: validCoordinate(record.lon, -180, 180),
  };
}

function mapTafPeriod(candidate: unknown): TafPeriod | null {
  if (!isRecord(candidate)) return null;
  const visibilityData = visibility(candidate.visib);
  const clouds = tafCloudLayers(candidate.clouds);
  const from = isoDate(candidate.timeFrom);
  const to = isoDate(candidate.timeTo);
  const changeIndicator = stringValue(candidate.fcstChange);
  const weather = weatherTokens(candidate.wxString);
  const hasData = Boolean(from || to || changeIndicator || clouds.length || weather.length
    || visibilityData.visibilityMeters !== null || numberValue(candidate.wdir) !== null
    || numberValue(candidate.wspd) !== null || numberValue(candidate.wgst) !== null);
  if (!hasData) return null;
  return {
    from,
    to,
    changeIndicator,
    probability: numberValue(candidate.probability),
    windDirectionDeg: numberValue(candidate.wdir),
    windVariable: typeof candidate.wdir === "string" && candidate.wdir.trim().toUpperCase() === "VRB",
    windSpeedKt: numberValue(candidate.wspd),
    windGustKt: numberValue(candidate.wgst),
    ...visibilityData,
    clouds,
    weather,
    flightCategory: deriveFlightCategory(clouds, visibilityData.visibilityMeters, visibilityData.visibilityLessThan),
  };
}

function mapTaf(payload: unknown, icaoCode: string): TafForecast | null {
  if (!Array.isArray(payload)) throw new Error("TAF response is not an array");
  if (payload.length === 0) return null;
  const record = payload.find((candidate) => isRecord(candidate) && stringValue(candidate.icaoId)?.toUpperCase() === icaoCode);
  if (!record || !isRecord(record)) throw new Error("TAF response did not contain the requested airport");
  return {
    stationId: icaoCode,
    rawText: stringValue(record.rawTAF),
    issueTime: isoDate(record.issueTime),
    issuedAt: isoDate(record.issueTime),
    validFrom: isoDate(record.validTimeFrom),
    validTo: isoDate(record.validTimeTo),
    periods: Array.isArray(record.fcsts) ? record.fcsts.flatMap((period) => {
      const mapped = mapTafPeriod(period);
      return mapped ? [mapped] : [];
    }) : [],
  };
}

function productUrl(baseUrl: string, product: "metar" | "taf", icaoCode: string): string {
  const url = new URL(`/api/data/${product}`, baseUrl);
  url.searchParams.set("ids", icaoCode);
  url.searchParams.set("format", "json");
  return url.toString();
}

function sigmetUrl(baseUrl: string, product: "isigmet" | "airsigmet"): string {
  const url = new URL(`/api/data/${product}`, baseUrl);
  url.searchParams.set("format", "geojson");
  return url.toString();
}

function combinedAbortSignal(timeoutMs: number, parentSignal?: AbortSignal): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  if (parentSignal) {
    if (parentSignal.aborted) abortFromParent();
    else parentSignal.addEventListener("abort", abortFromParent, { once: true });
  }
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timeout);
      parentSignal?.removeEventListener("abort", abortFromParent);
    },
  };
}

function retryAfterMs(response: Response, now: number): number | null {
  const value = response.headers.get("retry-after")?.trim();
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(24 * 60 * 60_000, Math.round(seconds * 1000));
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.min(24 * 60 * 60_000, Math.max(0, date - now)) : null;
}

function coordinatesValid(value: unknown): value is number[] {
  return Array.isArray(value)
    && value.length >= 2
    && Number.isFinite(value[0]) && Number.isFinite(value[1])
    && value[0] >= -180 && value[0] <= 180
    && value[1] >= -90 && value[1] <= 90;
}

function geometryValid(value: unknown): value is SigmetGeometry {
  if (!isRecord(value) || (value.type !== "Polygon" && value.type !== "MultiPolygon") || !Array.isArray(value.coordinates)) return false;
  const polygons = value.type === "Polygon" ? [value.coordinates] : value.coordinates;
  return polygons.every((polygon) => Array.isArray(polygon) && polygon.length > 0 && polygon.every((ring) => {
    if (!Array.isArray(ring) || ring.length < 4 || !ring.every(coordinatesValid)) return false;
    const first = ring[0];
    const last = ring[ring.length - 1];
    return first[0] === last[0] && first[1] === last[1];
  }));
}

function normalizedSigmetTime(value: unknown): string | null {
  return isoDate(value);
}

export function normalizeSigmetGeoJson(payload: unknown, now = Date.now(), fetchedAt = new Date(now).toISOString()): AviationSigmet[] {
  if (!isRecord(payload) || payload.type !== "FeatureCollection" || !Array.isArray(payload.features)) throw new Error("SIGMET response is not a FeatureCollection");
  return payload.features.flatMap((candidate, index) => {
    if (!isRecord(candidate) || candidate.type !== "Feature" || !geometryValid(candidate.geometry) || !isRecord(candidate.properties)) return [];
    const properties = candidate.properties;
    const validFrom = normalizedSigmetTime(properties.validTimeFrom);
    const validTo = normalizedSigmetTime(properties.validTimeTo);
    if (!validFrom || !validTo || Date.parse(validFrom) > now || Date.parse(validTo) <= now) return [];
    const office = stringValue(properties.icaoId);
    const firId = stringValue(properties.firId);
    const seriesId = stringValue(properties.seriesId);
    const id = stringValue(candidate.id) ?? `${office ?? "sigmet"}:${firId ?? ""}:${seriesId ?? index}:${validFrom}`;
    const sigmet: AviationSigmet = {
      id,
      issuingOffice: office,
      firId,
      firName: stringValue(properties.firName),
      phenomenon: stringValue(properties.hazard),
      hazard: stringValue(properties.hazard),
      qualifier: stringValue(properties.qualifier),
      validFrom,
      validTo,
      lowerFt: altitudeFeet(properties.base),
      upperFt: altitudeFeet(properties.top),
      seriesId,
      rawText: stringValue(properties.rawSigmet) ?? stringValue(properties.rawAirSigmet),
      geometry: candidate.geometry,
      source: "aviationweather",
      fetchedAt,
    };
    return [sigmet];
  });
}

function asFeatureCollection(sigmet: AviationSigmet[], fetchedAt: string): SigmetSnapshot {
  return {
    type: "FeatureCollection",
    features: sigmet.map(({ geometry, ...properties }) => ({ type: "Feature", id: properties.id, properties, geometry })),
    fetchedAt,
    stale: false,
  };
}

export class AviationWeatherProvider {
  private readonly fetcher: typeof fetch;
  private readonly cache: AviationWeatherCache;
  private readonly timeoutMs: number;
  private readonly now: () => number;
  private readonly baseUrl: string;
  private readonly userAgent: string;
  private readonly enabled: boolean;
  private readonly metarTtlMs: number;
  private readonly tafTtlMs: number;
  private readonly sigmetTtlMs: number;
  private readonly staleIfErrorMs: number;
  private readonly diagnostics: AviationWeatherDiagnostics;
  private backoffUntil = 0;

  constructor(options: AviationWeatherProviderOptions = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.cache = options.cache ?? new AviationWeatherCache(options.maxAirports ?? AVIATION_WEATHER_TTLS.maxAirports, options.staleIfErrorMs ?? getAviationWeatherStaleIfErrorMs(), options.now ?? Date.now);
    this.timeoutMs = options.timeoutMs ?? getAviationWeatherRequestTimeoutMs();
    this.now = options.now ?? Date.now;
    this.baseUrl = options.baseUrl ?? getAviationWeatherBaseUrl();
    this.userAgent = options.userAgent ?? getAviationWeatherUserAgent();
    this.enabled = options.enabled ?? true;
    this.metarTtlMs = options.metarTtlMs ?? getAviationWeatherMetarTtlMs();
    this.tafTtlMs = options.tafTtlMs ?? getAviationWeatherTafTtlMs();
    this.sigmetTtlMs = options.sigmetTtlMs ?? getAviationWeatherSigmetTtlMs();
    this.staleIfErrorMs = options.staleIfErrorMs ?? getAviationWeatherStaleIfErrorMs();
    this.diagnostics = {
      enabled: this.enabled,
      status: this.enabled ? "online" : "disabled",
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastLatencyMs: null,
      requests: 0,
      failures: 0,
      consecutiveFailures: 0,
      cacheHits: 0,
      cacheMisses: 0,
      metarEntries: 0,
      tafEntries: 0,
      activeSigmets: 0,
      sigmetStale: false,
      retryAfterMs: null,
    };
  }

  async getAirportWeather(rawIcaoCode: unknown, parentSignal?: AbortSignal): Promise<AirportWeather> {
    const icaoCode = normalizeWeatherIcao(rawIcaoCode);
    if (!icaoCode) throw new Error("Invalid airport ICAO");
    if (!this.enabled) throw new AviationWeatherUnavailableError();
    const [metar, taf] = await Promise.all([
      this.getProduct<MetarObservation>("metar", icaoCode, this.metarTtlMs, parentSignal),
      this.getProduct<TafForecast>("taf", icaoCode, this.tafTtlMs, parentSignal),
    ]);
    if (metar.value === null && taf.value === null && (metar.failed || taf.failed)) throw new AviationWeatherUnavailableError();
    const fetchedAt = Math.max(this.cache.fetchedAt("metar", icaoCode) ?? 0, this.cache.fetchedAt("taf", icaoCode) ?? 0) || this.now();
    const fetchedAtIso = new Date(fetchedAt).toISOString();
    return {
      icaoCode,
      metar: metar.value ? { ...metar.value, fetchedAt: fetchedAtIso, stale: metar.stale } : null,
      taf: taf.value ? { ...taf.value, fetchedAt: fetchedAtIso, stale: taf.stale } : null,
      fetchedAt: fetchedAtIso,
      stale: metar.stale || taf.stale,
      enabled: true,
      source: "Aviation Weather Center",
    };
  }

  async getSigmets(parentSignal?: AbortSignal): Promise<SigmetSnapshot> {
    if (!this.enabled) throw new AviationWeatherUnavailableError();
    const result = await this.cache.get<SigmetSnapshot>("sigmet", "current", async () => {
      const fetchedAt = new Date(this.now()).toISOString();
      const datasets = await Promise.allSettled([
        this.fetchSigmetDataset("isigmet", parentSignal),
        this.fetchSigmetDataset("airsigmet", parentSignal),
      ]);
      const failedDatasets = datasets.filter((dataset) => dataset.status === "rejected");
      const successful = datasets.filter((dataset) => dataset.status === "fulfilled");
      if (!successful.length) {
        const rateLimit = failedDatasets.find((dataset) => dataset.status === "rejected" && dataset.reason instanceof AviationWeatherRateLimitError);
        throw rateLimit && rateLimit.status === "rejected" ? rateLimit.reason : new Error("SIGMET datasets unavailable");
      }
      failedDatasets.forEach((dataset) => this.recordFailure(dataset.status === "rejected" ? dataset.reason : undefined));
      const current = successful.flatMap((dataset) => dataset.value ? normalizeSigmetGeoJson(dataset.value, this.now(), fetchedAt) : []);
      const deduped = [...new Map(current.map((item) => [item.id, item])).values()];
      this.diagnostics.activeSigmets = deduped.length;
      this.diagnostics.sigmetStale = false;
      return asFeatureCollection(deduped, fetchedAt);
    }, { ttlMs: this.sigmetTtlMs, staleIfErrorMs: this.staleIfErrorMs }, this.now(), (error) => this.recordFailure(error));
    if (!result.value) throw new AviationWeatherUnavailableError();
    this.diagnostics.sigmetStale = result.stale;
    return { ...result.value, stale: result.stale };
  }

  getDiagnostics(): AviationWeatherDiagnostics {
    const cacheStats = this.cache.stats();
    return {
      ...this.diagnostics,
      cacheHits: cacheStats.hits,
      cacheMisses: cacheStats.misses,
      metarEntries: this.cache.productEntries("metar"),
      tafEntries: this.cache.productEntries("taf"),
      retryAfterMs: this.backoffUntil > this.now() ? this.backoffUntil - this.now() : null,
    };
  }

  cacheSize(): number { return this.cache.size(); }
  cacheAirportCount(): number { return this.cache.airportCount(); }

  private async getProduct<T extends MetarObservation | TafForecast>(product: "metar" | "taf", icaoCode: string, ttlMs: number, parentSignal?: AbortSignal): Promise<ProductResult<T>> {
    return this.cache.get(product, icaoCode, () => this.fetchProduct(product, icaoCode, parentSignal), { ttlMs, staleIfErrorMs: this.staleIfErrorMs }, this.now(), (error) => this.recordFailure(error)) as unknown as Promise<ProductResult<T>>;
  }

  private async fetchProduct(product: "metar" | "taf", icaoCode: string, parentSignal?: AbortSignal): Promise<MetarObservation | TafForecast | null> {
    const payload = await this.fetchJson(productUrl(this.baseUrl, product, icaoCode), product, parentSignal);
    if (payload === null) return null;
    try {
      return product === "metar" ? mapMetar(payload, icaoCode) : mapTaf(payload, icaoCode);
    } catch {
      throw new Error(`AviationWeather ${product} malformed response`);
    }
  }

  private async fetchSigmetDataset(product: "isigmet" | "airsigmet", parentSignal?: AbortSignal): Promise<unknown | null> {
    return this.fetchJson(sigmetUrl(this.baseUrl, product), "sigmet", parentSignal);
  }

  private async fetchJson(url: string, product: Product, parentSignal?: AbortSignal): Promise<unknown | null> {
    const now = this.now();
    if (this.backoffUntil > now) throw new AviationWeatherRateLimitError(this.backoffUntil - now);
    const abort = combinedAbortSignal(this.timeoutMs, parentSignal);
    const started = this.now();
    this.diagnostics.requests += 1;
    this.diagnostics.lastAttemptAt = new Date(started).toISOString();
    try {
      const response = await this.fetcher(url, {
        cache: "no-store",
        headers: { Accept: product === "sigmet" ? "application/geo+json, application/json" : "application/json", "User-Agent": this.userAgent },
        signal: abort.signal,
      });
      this.diagnostics.lastLatencyMs = Math.max(0, this.now() - started);
      if (response.status === 204) {
        this.recordSuccess();
        return null;
      }
      if (response.status === 429) {
        const retry = retryAfterMs(response, this.now());
        this.backoffUntil = this.now() + (retry ?? 60_000);
        throw new AviationWeatherRateLimitError(retry);
      }
      if (!response.ok) throw new Error(`AviationWeather ${product} HTTP ${response.status}`);
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new Error(`AviationWeather ${product} malformed JSON`);
      }
      this.recordSuccess();
      return payload;
    } catch (error) {
      this.diagnostics.lastLatencyMs = Math.max(0, this.now() - started);
      throw error;
    } finally {
      abort.dispose();
    }
  }

  private recordSuccess(): void {
    const now = this.now();
    this.diagnostics.lastSuccessAt = new Date(now).toISOString();
    this.diagnostics.consecutiveFailures = 0;
    this.diagnostics.retryAfterMs = null;
    this.diagnostics.status = "online";
    if (this.backoffUntil <= now) this.backoffUntil = 0;
  }

  private recordFailure(error: unknown): void {
    this.diagnostics.failures += 1;
    this.diagnostics.consecutiveFailures += 1;
    if (error instanceof AviationWeatherRateLimitError) {
      this.diagnostics.status = "rate_limited";
      this.diagnostics.retryAfterMs = error.retryAfterMs;
      this.backoffUntil = Math.max(this.backoffUntil, this.now() + (error.retryAfterMs ?? 60_000));
      return;
    }
    this.diagnostics.status = this.diagnostics.lastSuccessAt ? "degraded" : "offline";
  }
}

export const defaultAviationWeatherProvider = new AviationWeatherProvider();
