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
  WeatherCacheSource,
} from "@/lib/weather/types";
import { getAviationWeatherBaseUrl, getAviationWeatherCacheFile, getAviationWeatherMetarMaxPersistedAgeMs, getAviationWeatherMetarTtlMs, getAviationWeatherRequestTimeoutMs, getAviationWeatherSigmetMaxPersistedAgeMs, getAviationWeatherSigmetTtlMs, getAviationWeatherStaleIfErrorMs, getAviationWeatherTafMaxPersistedAgeMs, getAviationWeatherTafTtlMs, getAviationWeatherUserAgent, isAviationWeatherPersistenceEnabled } from "@/lib/server/config";
import { deriveFlightCategory } from "@/lib/weather/flight-category";
import { parseStatuteMiles } from "@/lib/weather/visibility";
import {
  AviationWeatherPersistence,
  type AviationWeatherCachePersistence,
  type AviationWeatherPersistenceDiagnostics,
  type AviationWeatherProduct,
  type PersistentWeatherEntry,
} from "@/lib/server/aviation-weather-persistence";

export { parseStatuteMiles } from "@/lib/weather/visibility";

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

type Product = AviationWeatherProduct;
type SigmetDataset = "isigmet" | "airsigmet";

interface CacheEntry<T> {
  value: T | null;
  fetchedAt: number;
  freshUntil: number;
  staleUntil: number;
  source: WeatherCacheSource;
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

type CachePersistenceOptions = AviationWeatherCachePersistence;

/** Bounded product cache with negative entries and in-flight coalescing. */
export class AviationWeatherCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  private readonly airportOrder = new Map<string, number>();
  private readonly inFlight = new Map<string, Promise<ProductResult<unknown>>>();
  private readonly persistedEntries = new Map<string, PersistentWeatherEntry>();
  private hits = 0;
  private misses = 0;

  constructor(
    private readonly maxAirports: number = AVIATION_WEATHER_TTLS.maxAirports,
    private readonly defaultStaleIfErrorMs: number = AVIATION_WEATHER_TTLS.staleMs,
    private readonly clock: () => number = Date.now,
    private readonly persistence?: CachePersistenceOptions,
  ) {
    for (const entry of persistence?.load() ?? []) this.persistedEntries.set(`${entry.product}:${entry.key}`, entry);
  }

  async get<T>(
    product: Product,
    keyPart: string,
    loader: () => Promise<T | null>,
    options: ProductCacheOptions,
    now = this.clock(),
    onFailure?: (error: unknown) => void,
  ): Promise<ProductResult<T>> {
    const key = `${product}:${keyPart}`;
    let cached = this.entries.get(key) as CacheEntry<T> | undefined;
    if (!cached) {
      const persisted = this.persistedEntries.get(key);
      if (persisted) {
        const fetchedAt = Date.parse(persisted.fetchedAt);
        if (Number.isFinite(fetchedAt) && fetchedAt + (this.persistence?.maxAgeMsFor(product) ?? 0) > now) {
          cached = {
            value: persisted.value as T | null,
            fetchedAt,
            freshUntil: fetchedAt + options.ttlMs,
            staleUntil: fetchedAt + (this.persistence?.maxAgeMsFor(product) ?? options.ttlMs + (options.staleIfErrorMs ?? this.defaultStaleIfErrorMs)),
            source: "persistent-cache",
          };
          this.entries.set(key, cached);
          this.persistedEntries.delete(key);
          this.touchAirport(product, keyPart, now);
          this.evictIfNeeded();
        } else {
          this.persistedEntries.delete(key);
        }
      }
    }
    if (cached && cached.freshUntil > now) {
      this.hits += 1;
      this.touchAirport(product, keyPart, now);
      if (cached.source === "live") cached.source = "memory-cache";
      return { value: cached.value, stale: cached.source === "persistent-cache", failed: false };
    }

    if (cached?.source === "live") cached.source = "memory-cache";

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
          source: "live",
        });
        this.touchAirport(product, keyPart, fetchedAt);
        this.evictIfNeeded();
        this.persistedEntries.delete(key);
        this.schedulePersistence();
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

  source(product: Product, keyPart: string): WeatherCacheSource | null {
    return (this.entries.get(`${product}:${keyPart}`) as CacheEntry<unknown> | undefined)?.source ?? null;
  }

  staleEntries(product: Product, now = this.clock()): number {
    let count = 0;
    for (const entry of this.entries.entries()) {
      if (entry[0].startsWith(`${product}:`) && entry[1].value !== null && (entry[1].source === "persistent-cache" || entry[1].freshUntil <= now)) count += 1;
    }
    return count;
  }

  stats(): { hits: number; misses: number } {
    return { hits: this.hits, misses: this.misses };
  }

  clear(): void {
    this.entries.clear();
    this.airportOrder.clear();
    this.inFlight.clear();
    this.persistedEntries.clear();
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

  private schedulePersistence(): void {
    if (!this.persistence) return;
    const values = new Map<string, PersistentWeatherEntry>();
    for (const [key, entry] of this.persistedEntries) values.set(key, entry);
    for (const [key, entry] of this.entries) {
      const separator = key.indexOf(":");
      if (separator < 1) continue;
      const product = key.slice(0, separator) as Product;
      values.set(key, { product, key: key.slice(separator + 1), fetchedAt: new Date(entry.fetchedAt).toISOString(), value: entry.value });
    }
    this.persistence.schedule([...values.values()]);
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
  metarStaleEntries: number;
  tafStaleEntries: number;
  activeSigmets: number;
  sigmetStale: boolean;
  sigmetSnapshotAgeMs: number | null;
  sigmet: {
    overallStatus: "online" | "degraded" | "offline";
    international: SigmetDatasetDiagnostics;
    airsigmet: SigmetDatasetDiagnostics;
  };
  retryAfterMs: number | null;
  persistence: AviationWeatherPersistenceDiagnostics;
}

export interface SigmetDatasetDiagnostics {
  status: "fresh" | "stale" | "unavailable";
  lastSuccessAt: string | null;
  featureCount: number;
  stale: boolean;
  failures: number;
  consecutiveFailures: number;
  lastFailureAt: string | null;
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
  persistCache?: boolean;
  cacheFile?: string;
  persistenceMaxAgeMs?: number | Partial<Record<AviationWeatherProduct, number>>;
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
  const numeric = parseStatuteMiles(value);
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
  const rawText = stringValue(record.rawOb);
  const rawUpper = rawText?.toUpperCase() ?? "";
  const windSpeedKt = numberValue(record.wspd);
  return {
    stationId: icaoCode,
    rawText,
    observationTime: observedAt,
    observedAt,
    temperatureC: numberValue(record.temp),
    dewpointC: numberValue(record.dewp),
    windDirectionDeg: numericDirection !== null && numericDirection >= 0 ? numericDirection : null,
    windVariable: typeof direction === "string" && direction.trim().toUpperCase() === "VRB",
    windCalm: rawUpper.includes("00000KT") || (numericDirection === 0 && windSpeedKt === 0),
    windSpeedKt,
    windGustKt: numberValue(record.wgst),
    ...visibilityData,
    altimeterHpa: numberValue(record.altim),
    cavok: rawUpper.includes("CAVOK") || stringValue(record.wxString)?.toUpperCase() === "CAVOK",
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

function nullableNumber(value: unknown): number | null {
  return value === null ? null : numberValue(value);
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : value === null ? null : null;
}

function boundedText(value: unknown, maximum: number): string | null {
  return value === null ? null : typeof value === "string" && value.length <= maximum && !/[\0\r\n]/.test(value) ? value : null;
}

function persistedTimestamp(value: unknown): string | null {
  if (value === null) return null;
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(Date.parse(value)).toISOString() : null;
}

function persistedCloudLayers(value: unknown): MetarCloudLayer[] | null {
  if (!Array.isArray(value) || value.length > 32) return null;
  const result: MetarCloudLayer[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate) || typeof candidate.cover !== "string" || candidate.cover.length > 16) return null;
    const base = nullableNumber(candidate.baseFtAgl);
    const top = nullableNumber(candidate.topFtAgl);
    if (base === null && candidate.baseFtAgl !== null || top === null && candidate.topFtAgl !== undefined && candidate.topFtAgl !== null) return null;
    result.push({ cover: candidate.cover, baseFtAgl: base, topFtAgl: top });
  }
  return result;
}

function persistedTextList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 32 || value.some((item) => typeof item !== "string" || item.length > 32 || /[\0\r\n]/.test(item))) return null;
  return [...value];
}

function validatePersistedWeatherValue(product: AviationWeatherProduct, key: string, value: unknown): { valid: true; value: unknown } | { valid: false } {
  if (value === null) return { valid: true, value: null };
  if (product === "metar") {
    if (!isRecord(value) || value.stationId !== key) return { valid: false };
    const clouds = persistedCloudLayers(value.clouds);
    const weather = persistedTextList(value.weather);
    const flightCategory = value.flightCategory === null || value.flightCategory === "VFR" || value.flightCategory === "MVFR" || value.flightCategory === "IFR" || value.flightCategory === "LIFR" ? value.flightCategory : undefined;
    const observationTime = persistedTimestamp(value.observationTime);
    const observedAt = persistedTimestamp(value.observedAt);
    if (clouds === null || weather === null || flightCategory === undefined || observationTime === null && value.observationTime !== null || observedAt === null && value.observedAt !== undefined && value.observedAt !== null) return { valid: false };
    const windVariable = nullableBoolean(value.windVariable);
    const visibilityGreaterThan = nullableBoolean(value.visibilityGreaterThan);
    if (windVariable === null || visibilityGreaterThan === null || typeof value.windVariable !== "boolean" || typeof value.visibilityGreaterThan !== "boolean") return { valid: false };
    return { valid: true, value: {
      stationId: key, rawText: boundedText(value.rawText, 2_000), observationTime, observedAt,
      temperatureC: nullableNumber(value.temperatureC), dewpointC: nullableNumber(value.dewpointC),
      windDirectionDeg: nullableNumber(value.windDirectionDeg), windVariable, windCalm: value.windCalm === undefined ? undefined : value.windCalm === true,
      windSpeedKt: nullableNumber(value.windSpeedKt), windGustKt: nullableNumber(value.windGustKt), visibilityMeters: nullableNumber(value.visibilityMeters),
      visibilityGreaterThan, visibilityLessThan: value.visibilityLessThan === undefined ? undefined : value.visibilityLessThan === true,
      altimeterHpa: nullableNumber(value.altimeterHpa), cavok: value.cavok === undefined ? undefined : value.cavok === true,
      flightCategory, clouds, weather,
      latitude: value.latitude === undefined ? undefined : nullableNumber(value.latitude), longitude: value.longitude === undefined ? undefined : nullableNumber(value.longitude),
    } satisfies MetarObservation };
  }
  if (product === "taf") {
    if (!isRecord(value) || value.stationId !== key) return { valid: false };
    if (value.issueTime !== null && persistedTimestamp(value.issueTime) === null || value.issuedAt !== undefined && value.issuedAt !== null && persistedTimestamp(value.issuedAt) === null || value.validFrom !== null && persistedTimestamp(value.validFrom) === null || value.validTo !== null && persistedTimestamp(value.validTo) === null) return { valid: false };
    if (!Array.isArray(value.periods) || value.periods.length > 128) return { valid: false };
    const periods: TafPeriod[] = [];
    for (const candidate of value.periods) {
      if (!isRecord(candidate)) return { valid: false };
      const clouds = persistedCloudLayers(candidate.clouds) as TafCloudLayer[] | null;
      const weather = persistedTextList(candidate.weather);
      const flightCategory = candidate.flightCategory === null || candidate.flightCategory === "VFR" || candidate.flightCategory === "MVFR" || candidate.flightCategory === "IFR" || candidate.flightCategory === "LIFR" ? candidate.flightCategory : undefined;
      if (!clouds || !weather || flightCategory === undefined || candidate.from !== null && persistedTimestamp(candidate.from) === null || candidate.to !== null && persistedTimestamp(candidate.to) === null || typeof candidate.windVariable !== "boolean" || typeof candidate.visibilityGreaterThan !== "boolean") return { valid: false };
      periods.push({ from: persistedTimestamp(candidate.from), to: persistedTimestamp(candidate.to), changeIndicator: boundedText(candidate.changeIndicator, 32), probability: nullableNumber(candidate.probability), windDirectionDeg: nullableNumber(candidate.windDirectionDeg), windVariable: candidate.windVariable, windSpeedKt: nullableNumber(candidate.windSpeedKt), windGustKt: nullableNumber(candidate.windGustKt), visibilityMeters: nullableNumber(candidate.visibilityMeters), visibilityGreaterThan: candidate.visibilityGreaterThan, visibilityLessThan: candidate.visibilityLessThan === undefined ? undefined : candidate.visibilityLessThan === true, clouds, weather, flightCategory });
    }
    return { valid: true, value: { rawText: boundedText(value.rawText, 2_000), issueTime: persistedTimestamp(value.issueTime), issuedAt: value.issuedAt === undefined ? undefined : persistedTimestamp(value.issuedAt), validFrom: persistedTimestamp(value.validFrom), validTo: persistedTimestamp(value.validTo), stationId: key, periods } satisfies TafForecast };
  }
  if (!Array.isArray(value) || value.length > 1_024) return { valid: false };
  const sigmets: AviationSigmet[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate) || typeof candidate.id !== "string" || candidate.id.length > 200 || candidate.source !== key || !geometryValid(candidate.geometry)) return { valid: false };
    const validFrom = persistedTimestamp(candidate.validFrom);
    const validTo = persistedTimestamp(candidate.validTo);
    const fetchedAt = persistedTimestamp(candidate.fetchedAt);
    if (validFrom === null || validTo === null || fetchedAt === null) return { valid: false };
    sigmets.push({ id: candidate.id, issuingOffice: boundedText(candidate.issuingOffice, 32), firId: boundedText(candidate.firId, 64), firName: boundedText(candidate.firName, 160), phenomenon: boundedText(candidate.phenomenon, 80), hazard: boundedText(candidate.hazard, 80), qualifier: boundedText(candidate.qualifier, 32), validFrom, validTo, lowerFt: nullableNumber(candidate.lowerFt), upperFt: nullableNumber(candidate.upperFt), seriesId: boundedText(candidate.seriesId, 32), rawText: boundedText(candidate.rawText, 2_000), geometry: candidate.geometry, source: key as SigmetDataset, fetchedAt });
  }
  return { valid: true, value: sigmets };
}

function normalizedSigmetTime(value: unknown): string | null {
  return isoDate(value);
}

function identifierValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  return typeof value === "number" && Number.isFinite(value) ? String(value) : null;
}

function sigmetAltitude(properties: Record<string, unknown>, source: SigmetDataset): Pick<AviationSigmet, "lowerFt" | "upperFt"> {
  if (source === "airsigmet") {
    return {
      lowerFt: altitudeFeet(properties.altitudeLo1) ?? altitudeFeet(properties.altitudeLow1) ?? altitudeFeet(properties.altitudeLo2) ?? altitudeFeet(properties.base),
      upperFt: altitudeFeet(properties.altitudeHi1) ?? altitudeFeet(properties.altitudeHigh1) ?? altitudeFeet(properties.altitudeHi2) ?? altitudeFeet(properties.top),
    };
  }
  return {
    lowerFt: altitudeFeet(properties.base) ?? altitudeFeet(properties.altitudeLo1) ?? altitudeFeet(properties.altitudeLow1) ?? altitudeFeet(properties.altitudeLo2),
    upperFt: altitudeFeet(properties.top) ?? altitudeFeet(properties.altitudeHi1) ?? altitudeFeet(properties.altitudeHigh1) ?? altitudeFeet(properties.altitudeHi2),
  };
}

export function normalizeSigmetGeoJson(
  payload: unknown,
  now = Date.now(),
  fetchedAt = new Date(now).toISOString(),
  source: SigmetDataset = "isigmet",
): AviationSigmet[] {
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
    const id = identifierValue(candidate.id) ?? `${office ?? "sigmet"}:${firId ?? ""}:${seriesId ?? index}:${validFrom}`;
    const altitude = sigmetAltitude(properties, source);
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
      ...altitude,
      seriesId,
      rawText: stringValue(properties.rawSigmet) ?? stringValue(properties.rawAirSigmet),
      geometry: candidate.geometry,
      source,
      fetchedAt,
    };
    return [sigmet];
  });
}

function asFeatureCollection(sigmet: AviationSigmet[], fetchedAt: string): SigmetSnapshot {
  const idCounts = new Map<string, number>();
  for (const item of sigmet) idCounts.set(item.id, (idCounts.get(item.id) ?? 0) + 1);
  return {
    type: "FeatureCollection",
    features: sigmet.map(({ geometry, ...properties }) => {
      // International and domestic SIGMETs are distinct AWC products. Keep
      // same-looking upstream IDs from collapsing across those namespaces.
      const id = (idCounts.get(properties.id) ?? 0) > 1 ? `${properties.source}:${properties.id}` : properties.id;
      return { type: "Feature", id, properties: { ...properties, id }, geometry };
    }),
    fetchedAt,
    stale: false,
  };
}

function emptySigmetDatasetDiagnostics(): SigmetDatasetDiagnostics {
  return { status: "unavailable", lastSuccessAt: null, featureCount: 0, stale: false, failures: 0, consecutiveFailures: 0, lastFailureAt: null };
}

function currentSigmets(value: AviationSigmet[], now: number): AviationSigmet[] {
  return value.filter((item) => {
    const validFrom = item.validFrom ? Date.parse(item.validFrom) : Number.NaN;
    const validTo = item.validTo ? Date.parse(item.validTo) : Number.NaN;
    return Number.isFinite(validFrom) && Number.isFinite(validTo) && validFrom <= now && validTo > now;
  });
}

function currentTaf(value: TafForecast, now: number): boolean {
  const from = value.validFrom ? Date.parse(value.validFrom) : Number.NEGATIVE_INFINITY;
  const to = value.validTo ? Date.parse(value.validTo) : Number.POSITIVE_INFINITY;
  return Number.isFinite(from) && Number.isFinite(to) ? from <= now && to > now : false;
}

function mergeSigmetDatasets(values: AviationSigmet[][]): AviationSigmet[] {
  const merged = new Map<string, AviationSigmet>();
  for (const dataset of values) {
    for (const item of dataset) {
      // The two feeds are explicitly different AWC products. Deduplicate
      // repeated IDs within a product, but do not use text or geometry to
      // collapse advisories across product namespaces.
      merged.set(`${item.source}:${item.id}`, item);
    }
  }
  return [...merged.values()];
}

function combinedCacheSource(sources: Array<WeatherCacheSource | null>): WeatherCacheSource {
  if (sources.includes("persistent-cache")) return "persistent-cache";
  if (sources.includes("memory-cache")) return "memory-cache";
  return "live";
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
  private readonly persistence?: AviationWeatherCachePersistence;
  private readonly diagnostics: AviationWeatherDiagnostics;
  private sigmetAttempted = false;
  private backoffUntil = 0;

  constructor(options: AviationWeatherProviderOptions = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.persistence = options.cache ? undefined : options.persistCache
      ? new AviationWeatherPersistence({
        cacheFile: options.cacheFile ?? getAviationWeatherCacheFile(),
        maxAgeMs: options.persistenceMaxAgeMs ?? {
          metar: getAviationWeatherMetarMaxPersistedAgeMs(),
          taf: getAviationWeatherTafMaxPersistedAgeMs(),
          sigmet: getAviationWeatherSigmetMaxPersistedAgeMs(),
        },
        maxEntries: (options.maxAirports ?? AVIATION_WEATHER_TTLS.maxAirports) * 2 + 2,
        now: options.now ?? Date.now,
        validateValue: validatePersistedWeatherValue,
      })
      : undefined;
    this.cache = options.cache ?? new AviationWeatherCache(
      options.maxAirports ?? AVIATION_WEATHER_TTLS.maxAirports,
      options.staleIfErrorMs ?? getAviationWeatherStaleIfErrorMs(),
      options.now ?? Date.now,
      this.persistence,
    );
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
      metarStaleEntries: 0,
      tafStaleEntries: 0,
      activeSigmets: 0,
      sigmetStale: true,
      sigmetSnapshotAgeMs: null,
      sigmet: {
        overallStatus: "offline",
        international: emptySigmetDatasetDiagnostics(),
        airsigmet: emptySigmetDatasetDiagnostics(),
      },
      retryAfterMs: null,
      persistence: this.persistence?.getDiagnostics() ?? {
        enabled: false,
        cacheFile: getAviationWeatherCacheFile(),
        loadedFromDisk: false,
        diskEntriesLoaded: 0,
        diskEntriesRejected: 0,
        lastLoadAt: null,
        lastLoadError: null,
        dirty: false,
        lastSaveAt: null,
        lastSaveEntries: 0,
        lastSaveError: null,
        writes: 0,
      },
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
    if (metar.stale || taf.stale) this.diagnostics.status = this.backoffUntil > this.now() ? "rate_limited" : "degraded";
    const fetchedAt = Math.max(this.cache.fetchedAt("metar", icaoCode) ?? 0, this.cache.fetchedAt("taf", icaoCode) ?? 0) || this.now();
    const fetchedAtIso = new Date(fetchedAt).toISOString();
    const metarFetchedAt = this.cache.fetchedAt("metar", icaoCode) ?? fetchedAt;
    const tafFetchedAt = this.cache.fetchedAt("taf", icaoCode) ?? fetchedAt;
    const tafSource = this.cache.source("taf", icaoCode);
    const tafValue = taf.value && (tafSource !== "persistent-cache" || currentTaf(taf.value, this.now())) ? taf.value : null;
    const cacheSource = combinedCacheSource([this.cache.source("metar", icaoCode), this.cache.source("taf", icaoCode)]);
    return {
      icaoCode,
      metar: metar.value ? { ...metar.value, fetchedAt: new Date(metarFetchedAt).toISOString(), stale: metar.stale } : null,
      taf: tafValue ? { ...tafValue, fetchedAt: new Date(tafFetchedAt).toISOString(), stale: taf.stale } : null,
      fetchedAt: fetchedAtIso,
      stale: metar.stale || taf.stale,
      cacheSource,
      snapshotAgeMs: Math.max(0, this.now() - fetchedAt),
      enabled: true,
      source: "Aviation Weather Center",
    };
  }

  async getSigmets(parentSignal?: AbortSignal): Promise<SigmetSnapshot> {
    if (!this.enabled) throw new AviationWeatherUnavailableError();
    this.sigmetAttempted = true;
    const [internationalResult, airsigmetResult] = await Promise.all([
      this.getSigmetDataset("isigmet", parentSignal),
      this.getSigmetDataset("airsigmet", parentSignal),
    ]);
    const results: Array<[SigmetDataset, ProductResult<AviationSigmet[]>]> = [
      ["isigmet", internationalResult],
      ["airsigmet", airsigmetResult],
    ];
    const currentDatasets = results.map(([dataset, result]) => {
      const current = result.value === null ? [] : currentSigmets(result.value, this.now());
      this.updateSigmetDatasetDiagnostics(dataset, result, current.length);
      return { dataset, result, current };
    });
    const usable = currentDatasets.filter(({ result }) => result.value !== null);
    this.refreshSigmetDiagnostics(usable.length > 0);
    if (!usable.length) throw new AviationWeatherUnavailableError();

    const merged = mergeSigmetDatasets(usable.flatMap(({ current }) => [current]));
    const fetchedAtMs = Math.max(...results.map(([dataset]) => this.cache.fetchedAt("sigmet", dataset) ?? 0));
    const fetchedAt = new Date(fetchedAtMs || this.now()).toISOString();
    const stale = currentDatasets.some(({ result }) => result.stale || result.failed);
    const snapshotAgeMs = Math.max(0, this.now() - (fetchedAtMs || this.now()));
    const cacheSource = combinedCacheSource(results.map(([dataset]) => this.cache.source("sigmet", dataset)));
    this.diagnostics.activeSigmets = merged.length;
    this.diagnostics.sigmetStale = stale;
    this.diagnostics.sigmetSnapshotAgeMs = snapshotAgeMs;
    return { ...asFeatureCollection(merged, fetchedAt), stale, cacheSource, snapshotAgeMs };
  }

  getDiagnostics(): AviationWeatherDiagnostics {
    const cacheStats = this.cache.stats();
    return {
      ...this.diagnostics,
      cacheHits: cacheStats.hits,
      cacheMisses: cacheStats.misses,
      metarEntries: this.cache.productEntries("metar"),
      tafEntries: this.cache.productEntries("taf"),
      metarStaleEntries: this.cache.staleEntries("metar", this.now()),
      tafStaleEntries: this.cache.staleEntries("taf", this.now()),
      sigmet: {
        overallStatus: this.diagnostics.sigmet.overallStatus,
        international: { ...this.diagnostics.sigmet.international },
        airsigmet: { ...this.diagnostics.sigmet.airsigmet },
      },
      retryAfterMs: this.backoffUntil > this.now() ? this.backoffUntil - this.now() : null,
      persistence: this.persistence?.getDiagnostics() ?? {
        enabled: false,
        cacheFile: getAviationWeatherCacheFile(),
        loadedFromDisk: false,
        diskEntriesLoaded: 0,
        diskEntriesRejected: 0,
        lastLoadAt: null,
        lastLoadError: null,
        dirty: false,
        lastSaveAt: null,
        lastSaveEntries: 0,
        lastSaveError: null,
        writes: 0,
      },
    };
  }

  cacheSize(): number { return this.cache.size(); }
  cacheAirportCount(): number { return this.cache.airportCount(); }

  async flushPersistence(): Promise<void> {
    await this.persistence?.flush();
  }

  private async getProduct<T extends MetarObservation | TafForecast>(product: "metar" | "taf", icaoCode: string, ttlMs: number, parentSignal?: AbortSignal): Promise<ProductResult<T>> {
    return this.cache.get(product, icaoCode, () => this.fetchProduct(product, icaoCode, parentSignal), { ttlMs, staleIfErrorMs: this.staleIfErrorMs }, this.now(), (error) => this.recordFailure(error)) as unknown as Promise<ProductResult<T>>;
  }

  private async getSigmetDataset(dataset: SigmetDataset, parentSignal?: AbortSignal): Promise<ProductResult<AviationSigmet[]>> {
    return this.cache.get<AviationSigmet[]>("sigmet", dataset, async () => {
      const payload = await this.fetchSigmetDataset(dataset, parentSignal);
      if (payload === null) return [];
      const fetchedAt = new Date(this.now()).toISOString();
      return normalizeSigmetGeoJson(payload, this.now(), fetchedAt, dataset);
    }, { ttlMs: this.sigmetTtlMs, staleIfErrorMs: this.staleIfErrorMs }, this.now(), (error) => this.recordFailure(error))
      .then((result) => {
        if (result.stale || result.failed) this.recordSigmetDatasetFailure(dataset, result.stale);
        return result;
      });
  }

  private updateSigmetDatasetDiagnostics(dataset: SigmetDataset, result: ProductResult<AviationSigmet[]>, featureCount: number): void {
    const diagnostics = this.diagnostics.sigmet[dataset === "isigmet" ? "international" : "airsigmet"];
    diagnostics.featureCount = featureCount;
    if (result.value === null || result.failed) {
      diagnostics.status = "unavailable";
      diagnostics.stale = false;
      return;
    }
    diagnostics.status = result.stale ? "stale" : "fresh";
    diagnostics.stale = result.stale;
    const fetchedAt = this.cache.fetchedAt("sigmet", dataset);
    if (fetchedAt !== null) diagnostics.lastSuccessAt = new Date(fetchedAt).toISOString();
    if (!result.stale) {
      const recoveredAfterFailures = diagnostics.consecutiveFailures > 0;
      diagnostics.consecutiveFailures = 0;
      if (recoveredAfterFailures) console.info(`[Aviation Weather] ${dataset} recovered`);
    }
  }

  private recordSigmetDatasetFailure(dataset: SigmetDataset, usingStale: boolean): void {
    const diagnostics = this.diagnostics.sigmet[dataset === "isigmet" ? "international" : "airsigmet"];
    const firstFailure = diagnostics.consecutiveFailures === 0;
    diagnostics.failures += 1;
    diagnostics.consecutiveFailures += 1;
    diagnostics.lastFailureAt = new Date(this.now()).toISOString();
    if (firstFailure) {
      const label = dataset === "isigmet" ? "International SIGMET" : "AirSIGMET";
      const source = this.cache.source("sigmet", dataset);
      if (usingStale && source === "persistent-cache") {
        const fetchedAt = this.cache.fetchedAt("sigmet", dataset);
        const ageMinutes = fetchedAt === null ? null : Math.max(0, Math.round((this.now() - fetchedAt) / 60_000));
        console.warn(`[Aviation Weather] ${label} provider unavailable; using persisted snapshot${ageMinutes === null ? "" : ` age=${ageMinutes}m`}.`);
      } else console.warn(`[Aviation Weather] ${label} fetch failed; ${usingStale ? "using stale memory cache." : "no usable cache."}`);
    }
  }

  private refreshSigmetDiagnostics(hasUsableDataset: boolean): void {
    const international = this.diagnostics.sigmet.international.status;
    const airsigmet = this.diagnostics.sigmet.airsigmet.status;
    const bothFresh = international === "fresh" && airsigmet === "fresh";
    const overallStatus = !hasUsableDataset ? "offline" : bothFresh ? "online" : "degraded";
    this.diagnostics.sigmet.overallStatus = overallStatus;
    this.diagnostics.sigmetStale = !bothFresh;
    if (!hasUsableDataset && this.backoffUntil > this.now()) this.diagnostics.status = "rate_limited";
    else if (overallStatus === "online") this.diagnostics.status = "online";
    else if (overallStatus === "degraded") this.diagnostics.status = "degraded";
    else this.diagnostics.status = "offline";
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
    if (!this.sigmetAttempted) this.diagnostics.status = "online";
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

export const defaultAviationWeatherProvider = new AviationWeatherProvider({
  persistCache: isAviationWeatherPersistenceEnabled(),
});
