import type { AirportWeather, MetarObservation, TafForecast } from "@/lib/weather/types";

export const AVIATION_WEATHER_BASE_URL = "https://aviationweather.gov";
export const AVIATION_WEATHER_USER_AGENT = "AirRadar/0.1.0 (+https://airradar.pomykal.cz)";

export const AVIATION_WEATHER_TTLS = {
  metarMs: 5 * 60_000,
  tafMs: 15 * 60_000,
  staleMs: 60 * 60_000,
  maxAirports: 256,
  timeoutMs: 3_500,
} as const;

type Product = "metar" | "taf";

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
}

/** A small LRU cache shared by METAR and TAF product entries. */
export class AviationWeatherCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  private readonly airportOrder = new Map<string, number>();
  private readonly inFlight = new Map<string, Promise<ProductResult<unknown>>>();

  constructor(private readonly maxAirports: number = AVIATION_WEATHER_TTLS.maxAirports) {}

  async get<T>(
    product: Product,
    icaoCode: string,
    loader: () => Promise<T | null>,
    options: ProductCacheOptions,
    now = Date.now(),
  ): Promise<ProductResult<T>> {
    const key = `${product}:${icaoCode}`;
    const cached = this.entries.get(key) as CacheEntry<T> | undefined;
    if (cached && cached.freshUntil > now) {
      this.touchAirport(icaoCode, now);
      return { value: cached.value, stale: false, failed: false };
    }

    const existing = this.inFlight.get(key);
    if (existing) return existing as Promise<ProductResult<T>>;

    const request = loader()
      .then((value) => {
        const fetchedAt = Date.now();
        this.entries.set(key, {
          value,
          fetchedAt,
          freshUntil: fetchedAt + options.ttlMs,
          staleUntil: fetchedAt + options.ttlMs + AVIATION_WEATHER_TTLS.staleMs,
        });
        this.touchAirport(icaoCode, fetchedAt);
        this.evictIfNeeded();
        return { value, stale: false, failed: false } satisfies ProductResult<T>;
      })
      .catch(() => {
        const stale = this.entries.get(key) as CacheEntry<T> | undefined;
        const staleNow = Date.now();
        if (stale && stale.value !== null && stale.staleUntil > staleNow) {
          this.touchAirport(icaoCode, staleNow);
          return { value: stale.value, stale: true, failed: false } satisfies ProductResult<T>;
        }
        if (stale && stale.staleUntil <= staleNow) this.entries.delete(key);
        return { value: null, stale: false, failed: true } satisfies ProductResult<T>;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });
    this.inFlight.set(key, request as Promise<ProductResult<unknown>>);
    return request;
  }

  size(): number {
    return this.entries.size;
  }

  airportCount(): number {
    return this.airportOrder.size;
  }

  clear(): void {
    this.entries.clear();
    this.airportOrder.clear();
    this.inFlight.clear();
  }

  private touchAirport(icaoCode: string, now: number): void {
    this.airportOrder.delete(icaoCode);
    this.airportOrder.set(icaoCode, now);
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

export interface AviationWeatherProviderOptions {
  fetcher?: typeof fetch;
  cache?: AviationWeatherCache;
  timeoutMs?: number;
  now?: () => number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

function isoDate(value: unknown): string | null {
  const date = typeof value === "number" && Number.isFinite(value)
    ? new Date(value * 1000)
    : typeof value === "string" && value.trim()
      ? new Date(value)
      : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

export function normalizeWeatherIcao(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{4}$/.test(normalized) ? normalized : null;
}

/** AviationWeather returns statute miles; keep the conversion in one tested helper. */
export function statuteMilesToMeters(value: number): number {
  return Math.round(value * 1609.344);
}

function visibility(value: unknown): Pick<MetarObservation, "visibilityMeters" | "visibilityGreaterThan"> {
  const raw = typeof value === "string" ? value.trim() : value;
  const greaterThan = typeof raw === "string" && raw.endsWith("+");
  const numeric = typeof raw === "string" ? Number(raw.replace(/\+$/, "")) : numberValue(raw);
  return {
    visibilityMeters: numeric !== null && numeric >= 0 ? statuteMilesToMeters(numeric) : null,
    visibilityGreaterThan: greaterThan,
  };
}

function mapMetar(payload: unknown, icaoCode: string): MetarObservation | null {
  if (!Array.isArray(payload)) throw new Error("METAR response is not an array");
  if (payload.length === 0) return null;
  const record = payload.find((candidate) => isRecord(candidate) && stringValue(candidate.icaoId)?.toUpperCase() === icaoCode);
  if (!record || !isRecord(record)) throw new Error("METAR response did not contain the requested airport");

  const direction = record.wdir;
  const numericDirection = numberValue(direction);
  const windVariable = typeof direction === "string" && direction.trim().toUpperCase() === "VRB";
  const visibilityData = visibility(record.visib);
  return {
    rawText: stringValue(record.rawOb),
    observationTime: isoDate(record.reportTime) ?? isoDate(record.obsTime),
    temperatureC: numberValue(record.temp),
    dewpointC: numberValue(record.dewp),
    windDirectionDeg: numericDirection !== null && numericDirection >= 0 ? numericDirection : null,
    windVariable,
    windSpeedKt: numberValue(record.wspd),
    windGustKt: numberValue(record.wgst),
    ...visibilityData,
    altimeterHpa: numberValue(record.altim),
    flightCategory: stringValue(record.fltCat)?.toUpperCase() ?? null,
  };
}

function mapTaf(payload: unknown, icaoCode: string): TafForecast | null {
  if (!Array.isArray(payload)) throw new Error("TAF response is not an array");
  if (payload.length === 0) return null;
  const record = payload.find((candidate) => isRecord(candidate) && stringValue(candidate.icaoId)?.toUpperCase() === icaoCode);
  if (!record || !isRecord(record)) throw new Error("TAF response did not contain the requested airport");
  return {
    rawText: stringValue(record.rawTAF),
    issueTime: isoDate(record.issueTime),
    validFrom: isoDate(record.validTimeFrom),
    validTo: isoDate(record.validTimeTo),
  };
}

function productUrl(product: Product, icaoCode: string): string {
  const url = new URL(`/api/data/${product}`, AVIATION_WEATHER_BASE_URL);
  url.searchParams.set("ids", icaoCode);
  url.searchParams.set("format", "json");
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

export class AviationWeatherProvider {
  private readonly fetcher: typeof fetch;
  private readonly cache: AviationWeatherCache;
  private readonly timeoutMs: number;
  private readonly now: () => number;

  constructor(options: AviationWeatherProviderOptions = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.cache = options.cache ?? new AviationWeatherCache();
    this.timeoutMs = options.timeoutMs ?? AVIATION_WEATHER_TTLS.timeoutMs;
    this.now = options.now ?? Date.now;
  }

  async getAirportWeather(rawIcaoCode: unknown, parentSignal?: AbortSignal): Promise<AirportWeather> {
    const icaoCode = normalizeWeatherIcao(rawIcaoCode);
    if (!icaoCode) throw new Error("Invalid airport ICAO");

    const [metar, taf] = await Promise.all([
      this.getProduct<MetarObservation>("metar", icaoCode, AVIATION_WEATHER_TTLS.metarMs, parentSignal),
      this.getProduct<TafForecast>("taf", icaoCode, AVIATION_WEATHER_TTLS.tafMs, parentSignal),
    ]);
    if (metar.value === null && taf.value === null && (metar.failed || taf.failed)) {
      throw new AviationWeatherUnavailableError();
    }
    return {
      icaoCode,
      metar: metar.value,
      taf: taf.value,
      fetchedAt: new Date(this.now()).toISOString(),
      stale: metar.stale || taf.stale,
    };
  }

  cacheSize(): number {
    return this.cache.size();
  }

  cacheAirportCount(): number {
    return this.cache.airportCount();
  }

  private async getProduct<T extends MetarObservation | TafForecast>(
    product: Product,
    icaoCode: string,
    ttlMs: number,
    parentSignal?: AbortSignal,
  ): Promise<ProductResult<T>> {
    return this.cache.get(product, icaoCode, () => this.fetchProduct(product, icaoCode, parentSignal), { ttlMs }, this.now()) as unknown as Promise<ProductResult<T>>;
  }

  private async fetchProduct(product: Product, icaoCode: string, parentSignal?: AbortSignal): Promise<MetarObservation | TafForecast | null> {
    const abort = combinedAbortSignal(this.timeoutMs, parentSignal);
    try {
      const response = await this.fetcher(productUrl(product, icaoCode), {
        cache: "no-store",
        headers: { Accept: "application/json", "User-Agent": AVIATION_WEATHER_USER_AGENT },
        signal: abort.signal,
      });
      if (response.status === 204) return null;
      if (!response.ok) {
        console.warn(`[aviation-weather] ${product} HTTP ${response.status}`);
        throw new Error(`AviationWeather ${product} HTTP ${response.status}`);
      }
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        console.warn(`[aviation-weather] ${product} malformed JSON`);
        throw new Error(`AviationWeather ${product} malformed JSON`);
      }
      try {
        return product === "metar" ? mapMetar(payload, icaoCode) : mapTaf(payload, icaoCode);
      } catch {
        console.warn(`[aviation-weather] ${product} malformed response`);
        throw new Error(`AviationWeather ${product} malformed response`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("AviationWeather ")) throw error;
      console.warn(`[aviation-weather] ${product} request failed`);
      throw new Error(`AviationWeather ${product} request failed`);
    } finally {
      abort.dispose();
    }
  }
}

export const defaultAviationWeatherProvider = new AviationWeatherProvider();
