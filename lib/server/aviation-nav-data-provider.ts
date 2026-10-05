import { getAviationWeatherBaseUrl, getAviationWeatherRequestTimeoutMs, getAviationWeatherUserAgent } from "@/lib/server/config";
import type { AviationNavDataSnapshot, AviationNavPoint, AviationNavPointKind } from "@/lib/navigation-data/types";

const SOURCE = "Aviation Weather Center" as const;
const DEFAULT_TTL_MS = 6 * 60 * 60_000;
const DEFAULT_STALE_MS = 7 * 24 * 60 * 60_000;
const MAX_CACHE_ENTRIES = 64;
const MAX_UPSTREAM_RESULTS = 400;
const MAX_COMBINED_RESULTS = 600;
const MAX_IDENTIFIER_CACHE_ENTRIES = 128;
const MAX_UPSTREAM_REQUESTS_PER_MINUTE = 80;

export interface AviationNavQuery {
  latitude: number;
  longitude: number;
  radiusNm: number;
  kinds: AviationNavPointKind[];
}

export interface AviationNavProviderOptions {
  fetcher?: typeof fetch;
  now?: () => number;
  baseUrl?: string;
  userAgent?: string;
  timeoutMs?: number;
  ttlMs?: number;
  staleMs?: number;
}

export interface AviationNavProviderDiagnostics {
  status: "on_demand" | "ok" | "degraded" | "offline";
  requests: number;
  failures: number;
  consecutiveFailures: number;
  cacheEntries: number;
  inFlight: number;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastLatencyMs: number | null;
}

interface CacheEntry {
  snapshot: AviationNavDataSnapshot;
  freshUntil: number;
  staleUntil: number;
}

interface IdentifierCacheEntry {
  points: AviationNavPoint[];
  freshUntil: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function numberValue(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function textValue(maximum: number, ...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const text = value.trim();
    if (text && text.length <= maximum && !/[\0\r\n]/.test(text)) return text;
  }
  return null;
}

function normalizeId(value: unknown, maximum: number): string | null {
  const text = textValue(maximum, value)?.toUpperCase() ?? null;
  return text && /^[A-Z0-9]{2,8}$/.test(text) ? text : null;
}

function normalizeNavaid(value: unknown): AviationNavPoint | null {
  if (!isRecord(value)) return null;
  const id = normalizeId(value.id, 8);
  const latitude = numberValue(value.lat, value.latitude);
  const longitude = numberValue(value.lon, value.longitude);
  if (!id || latitude === null || longitude === null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  const frequency = numberValue(value.freq, value.frequency);
  const elevation = numberValue(value.elev, value.elevation, value.elevationFt);
  return {
    id,
    kind: "NAVAID",
    type: textValue(32, value.type),
    name: textValue(120, value.name),
    latitude,
    longitude,
    elevationFt: elevation !== null && elevation >= -2_000 && elevation <= 30_000 ? elevation : null,
    frequencyMhz: frequency !== null && frequency >= 0 && frequency <= 2_000 ? frequency : null,
    magneticDeclination: textValue(16, value.mag_dec, value.magdec, value.magneticDeclination),
    state: textValue(32, value.state),
    country: textValue(8, value.country)?.toUpperCase() ?? null,
    source: SOURCE,
  };
}

function normalizeFix(value: unknown): AviationNavPoint | null {
  if (!isRecord(value)) return null;
  const id = normalizeId(value.id, 8);
  const latitude = numberValue(value.lat, value.latitude);
  const longitude = numberValue(value.lon, value.longitude);
  if (!id || latitude === null || longitude === null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return {
    id,
    kind: "FIX",
    type: textValue(32, value.type),
    name: null,
    latitude,
    longitude,
    elevationFt: null,
    frequencyMhz: null,
    magneticDeclination: null,
    state: textValue(32, value.state),
    country: textValue(8, value.country)?.toUpperCase() ?? null,
    source: SOURCE,
  };
}

export function normalizeAviationNavPayload(kind: AviationNavPointKind, payload: unknown): AviationNavPoint[] {
  if (!Array.isArray(payload)) throw new Error(`${kind} response is not an array`);
  const normalizer = kind === "NAVAID" ? normalizeNavaid : normalizeFix;
  const dedup = new Map<string, AviationNavPoint>();
  for (const raw of payload.slice(0, MAX_UPSTREAM_RESULTS)) {
    const point = normalizer(raw);
    if (!point) continue;
    const key = [point.kind, point.id, point.latitude.toFixed(5), point.longitude.toFixed(5)].join(":");
    dedup.set(key, point);
  }
  return [...dedup.values()].sort((a, b) => a.id.localeCompare(b.id) || a.latitude - b.latitude || a.longitude - b.longitude);
}

export function normalizeAviationNavQuery(value: Partial<AviationNavQuery>): AviationNavQuery | null {
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  const radiusNm = Number(value.radiusNm);
  const kinds = Array.isArray(value.kinds)
    ? [...new Set(value.kinds.filter((kind): kind is AviationNavPointKind => kind === "NAVAID" || kind === "FIX"))]
    : [];
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  if (!Number.isFinite(radiusNm) || radiusNm < 10 || radiusNm > 250) return null;
  if (kinds.length === 0) return null;
  return { latitude, longitude, radiusNm: Math.round(radiusNm), kinds: kinds.sort() };
}

function cacheKey(query: AviationNavQuery): string {
  const qLat = Math.round(query.latitude * 10) / 10;
  const qLon = Math.round(query.longitude * 10) / 10;
  return [qLat.toFixed(1), qLon.toFixed(1), query.radiusNm, query.kinds.join(",")].join(":");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function bboxForQuery(query: AviationNavQuery): string {
  const radiusDegLat = query.radiusNm / 60;
  const cosLat = Math.max(0.15, Math.cos(query.latitude * Math.PI / 180));
  const radiusDegLon = query.radiusNm / (60 * cosLat);
  const south = clamp(query.latitude - radiusDegLat, -90, 90);
  const north = clamp(query.latitude + radiusDegLat, -90, 90);
  const west = clamp(query.longitude - radiusDegLon, -180, 180);
  const east = clamp(query.longitude + radiusDegLon, -180, 180);
  return [south, west, north, east].map((item) => item.toFixed(4)).join(",");
}

function endpointForKind(kind: AviationNavPointKind): "navaid" | "fix" {
  return kind === "NAVAID" ? "navaid" : "fix";
}

export class AviationNavDataProvider {
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private readonly baseUrl: string;
  private readonly userAgent: string;
  private readonly timeoutMs: number;
  private readonly ttlMs: number;
  private readonly staleMs: number;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<AviationNavDataSnapshot>>();
  private readonly identifierCache = new Map<string, IdentifierCacheEntry>();
  private readonly identifierInFlight = new Map<string, Promise<AviationNavPoint[]>>();
  private requests = 0;
  private failures = 0;
  private consecutiveFailures = 0;
  private lastAttemptAt: string | null = null;
  private lastSuccessAt: string | null = null;
  private lastLatencyMs: number | null = null;
  private upstreamWindowStartedAt = 0;
  private upstreamRequestsInWindow = 0;

  constructor(options: AviationNavProviderOptions = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? Date.now;
    this.baseUrl = options.baseUrl ?? getAviationWeatherBaseUrl();
    this.userAgent = options.userAgent ?? getAviationWeatherUserAgent();
    this.timeoutMs = options.timeoutMs ?? getAviationWeatherRequestTimeoutMs();
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.staleMs = options.staleMs ?? DEFAULT_STALE_MS;
  }

  private reserveUpstreamRequests(count: number): void {
    const now = this.now();
    if (now - this.upstreamWindowStartedAt >= 60_000) {
      this.upstreamWindowStartedAt = now;
      this.upstreamRequestsInWindow = 0;
    }
    if (this.upstreamRequestsInWindow + count > MAX_UPSTREAM_REQUESTS_PER_MINUTE) {
      throw new Error("AviationWeather navigation upstream rate budget exceeded");
    }
    this.upstreamRequestsInWindow += count;
  }

  getDiagnostics(): AviationNavProviderDiagnostics {
    return {
      status: this.lastSuccessAt === null
        ? this.failures > 0 ? "offline" : "on_demand"
        : this.consecutiveFailures > 0 ? "degraded" : "ok",
      requests: this.requests,
      failures: this.failures,
      consecutiveFailures: this.consecutiveFailures,
      cacheEntries: this.cache.size,
      inFlight: this.inFlight.size,
      lastAttemptAt: this.lastAttemptAt,
      lastSuccessAt: this.lastSuccessAt,
      lastLatencyMs: this.lastLatencyMs,
    };
  }

  async getData(rawQuery: Partial<AviationNavQuery>, parentSignal?: AbortSignal): Promise<AviationNavDataSnapshot> {
    const query = normalizeAviationNavQuery(rawQuery);
    if (!query) throw new Error("Invalid aviation nav query");
    const key = cacheKey(query);
    const now = this.now();
    const cached = this.cache.get(key);
    if (cached && cached.freshUntil > now) {
      return { ...cached.snapshot, cacheSource: "memory-cache", snapshotAgeMs: now - Date.parse(cached.snapshot.fetchedAt) };
    }
    const current = this.inFlight.get(key);
    if (current) return current;

    const request = this.fetchSnapshot(query, parentSignal)
      .catch((error) => {
        const stale = this.cache.get(key);
        if (stale && stale.staleUntil > this.now()) {
          return {
            ...stale.snapshot,
            stale: true,
            cacheSource: "stale-cache",
            snapshotAgeMs: this.now() - Date.parse(stale.snapshot.fetchedAt),
          } satisfies AviationNavDataSnapshot;
        }
        throw error;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, request);
    return request;
  }

  async searchIdentifiers(rawIds: readonly string[], parentSignal?: AbortSignal): Promise<AviationNavPoint[]> {
    const ids = [...new Set(rawIds
      .map((value) => value.trim().toUpperCase())
      .filter((value) => /^[A-Z0-9]{2,8}$/.test(value)))]
      .slice(0, 8);
    if (!ids.length) return [];
    const key = ids.sort().join(",");
    const now = this.now();
    const cached = this.identifierCache.get(key);
    if (cached && cached.freshUntil > now) return cached.points.map((point) => ({ ...point }));
    const current = this.identifierInFlight.get(key);
    if (current) return current;

    const request = this.fetchIdentifiers(ids, parentSignal)
      .finally(() => this.identifierInFlight.delete(key));
    this.identifierInFlight.set(key, request);
    return request;
  }

  private async fetchIdentifiers(ids: readonly string[], parentSignal?: AbortSignal): Promise<AviationNavPoint[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const abortParent = () => controller.abort(parentSignal?.reason);
    if (parentSignal) {
      if (parentSignal.aborted) abortParent();
      else parentSignal.addEventListener("abort", abortParent, { once: true });
    }
    try {
      this.reserveUpstreamRequests(2);
      const batches = await Promise.all((["NAVAID", "FIX"] as const).map(async (kind) => {
        const url = new URL(`/api/data/${endpointForKind(kind)}`, this.baseUrl);
        url.searchParams.set("ids", ids.join(","));
        url.searchParams.set("format", "json");
        const response = await this.fetcher(url, {
          cache: "no-store",
          headers: { Accept: "application/json", "User-Agent": this.userAgent },
          signal: controller.signal,
        });
        if (response.status === 204) return [] as AviationNavPoint[];
        if (!response.ok) throw new Error(`AviationWeather ${endpointForKind(kind)} HTTP ${response.status}`);
        return normalizeAviationNavPayload(kind, await response.json());
      }));
      const wanted = new Set(ids);
      const points = batches.flat()
        .filter((point) => wanted.has(point.id))
        .slice(0, ids.length * 4);
      const now = this.now();
      const cacheKey = [...ids].sort().join(",");
      this.identifierCache.delete(cacheKey);
      this.identifierCache.set(cacheKey, { points, freshUntil: now + this.ttlMs });
      while (this.identifierCache.size > MAX_IDENTIFIER_CACHE_ENTRIES) {
        const oldest = this.identifierCache.keys().next().value as string | undefined;
        if (!oldest) break;
        this.identifierCache.delete(oldest);
      }
      return points.map((point) => ({ ...point }));
    } finally {
      clearTimeout(timer);
      parentSignal?.removeEventListener("abort", abortParent);
    }
  }

  private async fetchSnapshot(query: AviationNavQuery, parentSignal?: AbortSignal): Promise<AviationNavDataSnapshot> {
    const startedAt = this.now();
    this.requests += 1;
    this.lastAttemptAt = new Date(startedAt).toISOString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const abortParent = () => controller.abort(parentSignal?.reason);
    if (parentSignal) {
      if (parentSignal.aborted) abortParent();
      else parentSignal.addEventListener("abort", abortParent, { once: true });
    }

    try {
      this.reserveUpstreamRequests(query.kinds.length);
      const bbox = bboxForQuery(query);
      const batches = await Promise.all(query.kinds.map(async (kind) => {
        const url = new URL(`/api/data/${endpointForKind(kind)}`, this.baseUrl);
        url.searchParams.set("bbox", bbox);
        url.searchParams.set("format", "json");
        const response = await this.fetcher(url, {
          cache: "no-store",
          headers: { Accept: "application/json", "User-Agent": this.userAgent },
          signal: controller.signal,
        });
        if (response.status === 204) return { points: [] as AviationNavPoint[], atCap: false };
        if (!response.ok) throw new Error(`AviationWeather ${endpointForKind(kind)} HTTP ${response.status}`);
        const payload = await response.json();
        const rawCount = Array.isArray(payload) ? payload.length : 0;
        return { points: normalizeAviationNavPayload(kind, payload), atCap: rawCount >= MAX_UPSTREAM_RESULTS };
      }));

      const combined = new Map<string, AviationNavPoint>();
      for (const batch of batches) for (const point of batch.points) {
        const key = [point.kind, point.id, point.latitude.toFixed(5), point.longitude.toFixed(5)].join(":");
        combined.set(key, point);
      }
      const points = [...combined.values()]
        .sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id))
        .slice(0, MAX_COMBINED_RESULTS);
      const fetchedAtMs = this.now();
      this.lastLatencyMs = Math.max(0, fetchedAtMs - startedAt);
      this.lastSuccessAt = new Date(fetchedAtMs).toISOString();
      this.consecutiveFailures = 0;

      const snapshot: AviationNavDataSnapshot = {
        points,
        fetchedAt: new Date(fetchedAtMs).toISOString(),
        stale: false,
        cacheSource: "live",
        snapshotAgeMs: 0,
        truncated: batches.some((batch) => batch.atCap) || combined.size > MAX_COMBINED_RESULTS,
        source: SOURCE,
        query: {
          latitude: query.latitude,
          longitude: query.longitude,
          radiusNm: query.radiusNm,
          kinds: query.kinds,
        },
      };
      const key = cacheKey(query);
      this.cache.delete(key);
      this.cache.set(key, {
        snapshot,
        freshUntil: fetchedAtMs + this.ttlMs,
        staleUntil: fetchedAtMs + this.staleMs,
      });
      while (this.cache.size > MAX_CACHE_ENTRIES) {
        const oldest = this.cache.keys().next().value as string | undefined;
        if (!oldest) break;
        this.cache.delete(oldest);
      }
      return snapshot;
    } catch (error) {
      this.lastLatencyMs = Math.max(0, this.now() - startedAt);
      this.failures += 1;
      this.consecutiveFailures += 1;
      throw error;
    } finally {
      clearTimeout(timer);
      parentSignal?.removeEventListener("abort", abortParent);
    }
  }
}

export const defaultAviationNavDataProvider = new AviationNavDataProvider();
