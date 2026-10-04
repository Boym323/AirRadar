import { getAviationWeatherBaseUrl, getAviationWeatherRequestTimeoutMs, getAviationWeatherUserAgent } from "@/lib/server/config";
import type { PirepObservation, PirepReportType, PirepSnapshot } from "@/lib/weather/types";

const SOURCE = "Aviation Weather Center" as const;
const DEFAULT_TTL_MS = 5 * 60_000;
const DEFAULT_STALE_MS = 15 * 60_000;
const MAX_CACHE_ENTRIES = 64;
const MAX_RESULTS = 200;

export interface PirepQuery {
  latitude: number;
  longitude: number;
  radiusNm: number;
  hours: number;
  altitudeFt?: number | null;
}

export interface PirepProviderOptions {
  fetcher?: typeof fetch;
  now?: () => number;
  baseUrl?: string;
  userAgent?: string;
  timeoutMs?: number;
  ttlMs?: number;
  staleMs?: number;
}

interface CacheEntry {
  snapshot: PirepSnapshot;
  freshUntil: number;
  staleUntil: number;
}

export interface PirepProviderDiagnostics {
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

function isoTime(...values: unknown[]): string | null {
  for (const value of values) {
    const date = typeof value === "number" && Number.isFinite(value)
      ? new Date(value > 100_000_000_000 ? value : value * 1000)
      : typeof value === "string" && value.trim()
        ? new Date(value)
        : null;
    if (date && Number.isFinite(date.getTime())) return date.toISOString();
  }
  return null;
}

function reportType(record: Record<string, unknown>, rawText: string | null): PirepReportType {
  const raw = textValue(32, record.pirepType, record.airepType, record.reportType, record.report_type, record.type, record.dataSource, record.data)?.toUpperCase() ?? "";
  if (raw.includes("AMDAR")) return "AMDAR";
  if (raw.includes("AIREP")) return "AIREP";
  if (raw.includes("PIREP") || raw === "UA" || raw === "UUA") return "PIREP";
  const prefix = rawText?.trim().toUpperCase() ?? "";
  if (prefix.startsWith("ARP") || prefix.startsWith("ARS") || prefix.includes(" AIREP ")) return "AIREP";
  if (prefix.startsWith("UA ") || prefix.startsWith("UUA ") || prefix.includes(" UA ") || prefix.includes(" UUA ")) return "PIREP";
  return "UNKNOWN";
}

function normalizedAltitude(record: Record<string, unknown>): number | null {
  const value = numberValue(record.altitude, record.altitudeFt, record.fltLvl, record.flightLevel, record.level);
  if (value === null || value < -2_000 || value > 70_000) return null;
  // AWC decoded output is normally feet. Small FL-like integer values are
  // accepted defensively as hundreds of feet.
  return value > 0 && value <= 600 ? value * 100 : value;
}

function normalizedIntensity(...values: unknown[]): string | null {
  const value = textValue(32, ...values)?.toUpperCase() ?? null;
  return value;
}

function stableId(record: Record<string, unknown>, observedAt: string, latitude: number, longitude: number, rawText: string | null): string {
  const explicit = textValue(160, record.id, record.reportId, record.receiptId);
  if (explicit) return explicit;
  return [observedAt, latitude.toFixed(4), longitude.toFixed(4), textValue(32, record.aircraftRef, record.acType) ?? "", rawText?.slice(0, 48) ?? ""].join("|");
}

export function normalizePirepPayload(payload: unknown): PirepObservation[] {
  if (!Array.isArray(payload)) throw new Error("PIREP response is not an array");
  const dedup = new Map<string, PirepObservation>();
  for (const value of payload.slice(0, 400)) {
    if (!isRecord(value)) continue;
    const latitude = numberValue(value.lat, value.latitude);
    const longitude = numberValue(value.lon, value.longitude);
    const observedAt = isoTime(value.obsTime, value.reportTime, value.observationTime, value.time);
    if (latitude === null || longitude === null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || !observedAt) continue;

    const rawText = textValue(2_000, value.rawOb, value.rawText, value.rawPirep, value.rawAirep);
    const type = reportType(value, rawText);
    const turbulenceIntensity = normalizedIntensity(value.tbInt1, value.tbInt2, value.turbInten, value.turbIntensity, value.turbulenceIntensity);
    const turbulenceType = textValue(48, value.tbType1, value.tbType2, value.turbType, value.turbulenceType);
    const turbulenceFrequency = textValue(48, value.tbFreq1, value.tbFreq2, value.turbFreq, value.turbulenceFrequency);
    const icingIntensity = normalizedIntensity(value.icgInt1, value.icgInt2, value.iceInten, value.icingInten, value.icingIntensity);
    const icingType = textValue(48, value.icgType1, value.icgType2, value.iceType, value.icingType);
    const report: PirepObservation = {
      id: stableId(value, observedAt, latitude, longitude, rawText),
      reportType: type,
      urgent: [value.pirepType, value.reportType, value.type].some((candidate) => normalizedIntensity(candidate)?.includes("URGENT") || normalizedIntensity(candidate) === "UUA") || rawText?.trim().toUpperCase().includes(" UUA ") === true || rawText?.trim().toUpperCase().startsWith("UUA ") === true,
      observedAt,
      receivedAt: isoTime(value.receiptTime, value.receivedAt),
      latitude,
      longitude,
      altitudeFt: normalizedAltitude(value),
      aircraftType: textValue(32, value.acType, value.aircraftType, value.aircraftRef),
      temperatureC: numberValue(value.temp, value.temperature, value.temperatureC),
      windDirectionDeg: numberValue(value.wdir, value.windDir, value.windDirection),
      windSpeedKt: numberValue(value.wspd, value.windSpeed, value.windSpeedKt),
      turbulence: turbulenceIntensity || turbulenceType || turbulenceFrequency ? { intensity: turbulenceIntensity, type: turbulenceType, frequency: turbulenceFrequency } : null,
      icing: icingIntensity || icingType ? { intensity: icingIntensity, type: icingType } : null,
      weather: textValue(160, value.wxString, value.weather),
      sky: textValue(160, value.skyCond, value.skyCondition, value.sky),
      visibilitySm: numberValue(value.visib, value.visibility),
      rawText,
    };
    dedup.set(report.id, report);
  }
  return [...dedup.values()]
    .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))
    .slice(0, MAX_RESULTS);
}

function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }

export function normalizePirepQuery(value: Partial<PirepQuery>): PirepQuery | null {
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  const radiusNm = Number(value.radiusNm);
  const hours = Number(value.hours);
  const altitude = value.altitudeFt === undefined || value.altitudeFt === null ? null : Number(value.altitudeFt);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  if (!Number.isFinite(radiusNm) || radiusNm < 10 || radiusNm > 300) return null;
  if (!Number.isFinite(hours) || hours < 1 || hours > 24) return null;
  if (altitude !== null && (!Number.isFinite(altitude) || altitude < 0 || altitude > 60_000)) return null;
  return {
    latitude,
    longitude,
    radiusNm: Math.round(radiusNm),
    hours: Math.round(hours),
    altitudeFt: altitude === null ? null : Math.round(altitude),
  };
}

function cacheKey(query: PirepQuery): string {
  const qLat = Math.round(query.latitude * 10) / 10;
  const qLon = Math.round(query.longitude * 10) / 10;
  const altitude = query.altitudeFt === null || query.altitudeFt === undefined ? "all" : Math.round(query.altitudeFt / 1000) * 1000;
  return [qLat.toFixed(1), qLon.toFixed(1), query.radiusNm, query.hours, altitude].join(":");
}

function pirepUrl(baseUrl: string, query: PirepQuery): string {
  const radiusDegLat = query.radiusNm / 60;
  const cosLat = Math.max(0.15, Math.cos(query.latitude * Math.PI / 180));
  const radiusDegLon = query.radiusNm / (60 * cosLat);
  const south = clamp(query.latitude - radiusDegLat, -90, 90);
  const north = clamp(query.latitude + radiusDegLat, -90, 90);
  const west = clamp(query.longitude - radiusDegLon, -180, 180);
  const east = clamp(query.longitude + radiusDegLon, -180, 180);
  const url = new URL("/api/data/pirep", baseUrl);
  // AWC PIREP bbox order is latitude,longitude,latitude,longitude.
  url.searchParams.set("bbox", [south, west, north, east].map((value) => value.toFixed(4)).join(","));
  url.searchParams.set("format", "json");
  url.searchParams.set("age", String(query.hours));
  if (query.altitudeFt !== null && query.altitudeFt !== undefined) url.searchParams.set("level", String(query.altitudeFt));
  return url.toString();
}

export class PirepProvider {
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private readonly baseUrl: string;
  private readonly userAgent: string;
  private readonly timeoutMs: number;
  private readonly ttlMs: number;
  private readonly staleMs: number;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<PirepSnapshot>>();
  private requests = 0;
  private failures = 0;
  private consecutiveFailures = 0;
  private lastAttemptAt: string | null = null;
  private lastSuccessAt: string | null = null;
  private lastLatencyMs: number | null = null;

  constructor(options: PirepProviderOptions = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? Date.now;
    this.baseUrl = options.baseUrl ?? getAviationWeatherBaseUrl();
    this.userAgent = options.userAgent ?? getAviationWeatherUserAgent();
    this.timeoutMs = options.timeoutMs ?? getAviationWeatherRequestTimeoutMs();
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.staleMs = options.staleMs ?? DEFAULT_STALE_MS;
  }

  getDiagnostics(): PirepProviderDiagnostics {
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

  async getPireps(rawQuery: Partial<PirepQuery>, parentSignal?: AbortSignal): Promise<PirepSnapshot> {
    const query = normalizePirepQuery(rawQuery);
    if (!query) throw new Error("Invalid PIREP query");
    const key = cacheKey(query);
    const now = this.now();
    const cached = this.cache.get(key);
    if (cached && cached.freshUntil > now) return { ...cached.snapshot, cacheSource: "memory-cache", snapshotAgeMs: now - Date.parse(cached.snapshot.fetchedAt) };
    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const request = this.fetchSnapshot(query, parentSignal)
      .catch((error) => {
        const stale = this.cache.get(key);
        if (stale && stale.staleUntil > this.now()) {
          return { ...stale.snapshot, stale: true, cacheSource: "stale-cache", snapshotAgeMs: this.now() - Date.parse(stale.snapshot.fetchedAt) } satisfies PirepSnapshot;
        }
        throw error;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, request);
    return request;
  }

  private async fetchSnapshot(query: PirepQuery, parentSignal?: AbortSignal): Promise<PirepSnapshot> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const abortParent = () => controller.abort(parentSignal?.reason);
    if (parentSignal) {
      if (parentSignal.aborted) abortParent();
      else parentSignal.addEventListener("abort", abortParent, { once: true });
    }
    const startedAt = this.now();
    this.requests += 1;
    this.lastAttemptAt = new Date(startedAt).toISOString();
    try {
      const response = await this.fetcher(pirepUrl(this.baseUrl, query), {
        cache: "no-store",
        headers: { Accept: "application/json", "User-Agent": this.userAgent },
        signal: controller.signal,
      });
      let reports: PirepObservation[] = [];
      if (response.status !== 204) {
        if (!response.ok) throw new Error(`AviationWeather pirep HTTP ${response.status}`);
        reports = normalizePirepPayload(await response.json());
      }
      const fetchedAtMs = this.now();
      this.lastLatencyMs = Math.max(0, fetchedAtMs - startedAt);
      this.lastSuccessAt = new Date(fetchedAtMs).toISOString();
      this.consecutiveFailures = 0;
      const snapshot: PirepSnapshot = {
        reports,
        fetchedAt: new Date(fetchedAtMs).toISOString(),
        stale: false,
        cacheSource: "live",
        snapshotAgeMs: 0,
        source: SOURCE,
        query: {
          latitude: query.latitude,
          longitude: query.longitude,
          radiusNm: query.radiusNm,
          hours: query.hours,
          altitudeFt: query.altitudeFt ?? null,
        },
      };
      const key = cacheKey(query);
      this.cache.delete(key);
      this.cache.set(key, { snapshot, freshUntil: fetchedAtMs + this.ttlMs, staleUntil: fetchedAtMs + this.staleMs });
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

export const defaultPirepProvider = new PirepProvider();
