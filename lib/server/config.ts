import path from "node:path";
import type { ReceiverPosition } from "@/lib/aircraft/types";
import { t } from "@/lib/i18n";
import { getAirRadarUserAgent } from "@/lib/server/user-agent";
import {
  DEFAULT_OGN_DDB_BATCH_DELAY_MS,
  DEFAULT_OGN_DDB_BATCH_SIZE,
  DEFAULT_OGN_DDB_CACHE_MAX_ENTRIES,
  DEFAULT_OGN_DDB_MIN_REQUEST_INTERVAL_MS,
  DEFAULT_OGN_DDB_NEGATIVE_TTL_MS,
  DEFAULT_OGN_DDB_URL,
} from "@/lib/ogn/ddb";
import { DEFAULT_OGN_SOFTRF_DDB_MAX_AGE_HOURS, DEFAULT_OGN_SOFTRF_DDB_PATH } from "@/lib/ogn/softrf";

export const DEFAULT_APP_TIMEZONE = "Europe/Prague";
export const DEFAULT_AIRCRAFT_METADATA_URL = "https://raw.githubusercontent.com/wiedehopf/tar1090-db/refs/heads/csv/aircraft.csv.gz";
export const DEFAULT_AVIATION_WEATHER_BASE_URL = "https://aviationweather.gov";
export const DEFAULT_AVIATION_WEATHER_CACHE_FILE = "/var/lib/airradar/weather/weather-cache-v1.json";
export const DEFAULT_ADSBDB_CACHE_FILE = "/var/lib/airradar/adsbdb/adsbdb-cache-v1.json";
export const DEFAULT_OGN_HOST = "aprs.glidernet.org";
export const DEFAULT_OGN_PORT = 14580;
export const DEFAULT_OGN_DDB_CACHE_FILE = "/var/lib/airradar/ogn-ddb-cache-v1.json";

export type PublicReceiverPositionMode = "exact" | "approximate" | "hidden";

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function envCoordinate(name: string, fallback: number, minimum: number, maximum: number): number {
  const value = envNumber(name, fallback);
  return value >= minimum && value <= maximum ? value : fallback;
}

export function getReceiverPosition(): ReceiverPosition {
  return {
    lat: envCoordinate("RECEIVER_LAT", 50.0755, -90, 90),
    lon: envCoordinate("RECEIVER_LON", 14.4378, -180, 180),
    name: process.env.RECEIVER_NAME?.trim() || t.radar.receiverName,
  };
}

export function getPublicReceiverPositionMode(): PublicReceiverPositionMode {
  const configured = process.env.PUBLIC_RECEIVER_POSITION_MODE?.trim().toLowerCase();
  return configured === "exact" || configured === "hidden" || configured === "approximate"
    ? configured
    : "approximate";
}

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

export function getAppTimezone(): string {
  const configured = process.env.APP_TIMEZONE?.trim();
  return configured && isValidTimezone(configured) ? configured : DEFAULT_APP_TIMEZONE;
}

export function dayKey(date: Date, timezone = getAppTimezone()): string {
  const safeTimezone = isValidTimezone(timezone) ? timezone : DEFAULT_APP_TIMEZONE;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function isReadsbConfigured(): boolean {
  return Boolean(process.env.READSB_BASE_URL?.trim());
}

/** Sample ATC is useful in demo mode, but is opt-in once a real receiver is configured. */
export function shouldUseSampleAtcData(): boolean {
  const explicit = process.env.ATC_SAMPLE_ENABLED?.trim().toLowerCase();
  if (explicit === "true") return true;
  if (explicit === "false") return false;
  return !isReadsbConfigured();
}

export function getPollIntervalMs(): number {
  return Math.max(1000, envNumber("READSB_POLL_INTERVAL_MS", 3000));
}

export function getHistorySampleIntervalMs(): number {
  return Math.max(15000, envNumber("HISTORY_SAMPLE_INTERVAL_MS", 20000));
}

export function getHistoryRetentionDays(): number {
  return Math.max(1, envNumber("HISTORY_RETENTION_DAYS", 30));
}

export function getFlightContinuityGapMs(): number {
  return Math.max(60_000, envNumber("FLIGHT_CONTINUITY_GAP_MS", 10 * 60_000));
}

export function getAircraftStaleAfterMs(): number {
  return Math.max(5_000, envNumber("AIRCRAFT_STALE_AFTER_MS", 15_000));
}

export function getMaxProviderRetryIntervalMs(): number {
  return Math.max(getPollIntervalMs(), envNumber("READSB_MAX_RETRY_INTERVAL_MS", 30_000));
}

export function isAdsbLolEnabled(): boolean {
  return process.env.ADSBLOL_ENABLED?.trim().toLowerCase() === "true";
}

function boundedInteger(name: string, fallback: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.trunc(envNumber(name, fallback))));
}

export function getAdsbLolBaseUrl(): string {
  const configured = process.env.ADSBLOL_BASE_URL?.trim();
  if (!configured) return "https://api.adsb.lol";
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "https://api.adsb.lol";
    if (url.hostname.toLowerCase().replace(/\.$/, "") === "re-api.adsb.lol") return "https://api.adsb.lol";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "https://api.adsb.lol";
  }
}

export function getAdsbLolRadiusNm(): number {
  return boundedInteger("ADSBLOL_RADIUS_NM", 250, 0, 250);
}

export function getAdsbLolPollIntervalMs(): number {
  return boundedInteger("ADSBLOL_POLL_INTERVAL_MS", 10_000, 5_000, 24 * 60 * 60_000);
}

export function getAdsbLolRequestTimeoutMs(): number {
  return boundedInteger("ADSBLOL_REQUEST_TIMEOUT_MS", 4_000, 500, 60_000);
}

export function getAdsbLolStaleAfterMs(): number {
  return boundedInteger("ADSBLOL_STALE_AFTER_MS", 30_000, 5_000, 24 * 60 * 60_000);
}

export function getAdsbLolMaxRetryIntervalMs(): number {
  return Math.max(getAdsbLolPollIntervalMs(), boundedInteger("ADSBLOL_MAX_RETRY_INTERVAL_MS", 60_000, 5_000, 24 * 60 * 60_000));
}

export function getAdsbLolMaxAircraft(): number {
  return boundedInteger("ADSBLOL_MAX_AIRCRAFT", 3_000, 1, 3_000);
}

export function getReceiverRefreshIntervalMs(): number {
  return Math.max(60_000, envNumber("RECEIVER_REFRESH_INTERVAL_MS", 5 * 60_000));
}

export function getAlertCooldownMs(): number {
  return Math.max(60_000, envNumber("ALERT_COOLDOWN_MS", 2 * 60 * 60_000));
}

export function isEmergencyAlertEnabled(): boolean {
  return process.env.ALERT_EMERGENCY_ENABLED?.trim().toLowerCase() === "true";
}

export function isAdsbDbEnabled(): boolean {
  return process.env.ADSBDB_ENABLED?.trim().toLowerCase() === "true";
}

export function isAircraftPhotosEnabled(): boolean {
  return process.env.AIRCRAFT_PHOTOS_ENABLED?.trim().toLowerCase() === "true";
}

export function getAdsbDbBaseUrl(): string {
  return process.env.ADSBDB_BASE_URL?.trim() || "https://api.adsbdb.com/v0";
}

export function isAdsbDbPersistenceEnabled(): boolean {
  const configured = (process.env.ADSBDB_PERSIST_CACHE ?? process.env.ADSBDB_PERSISTENCE)?.trim().toLowerCase();
  if (configured !== undefined && configured !== "") return configured === "true";
  return process.env.NODE_ENV === "production";
}

function safeAbsoluteCachePath(value: string | undefined, fallback: string): string {
  if (value && value.length <= 4_096 && value.startsWith("/") && !/[\0\r\n]/.test(value)) return value;
  return fallback;
}

export function getAdsbDbCacheFile(): string {
  const configuredFile = process.env.ADSBDB_CACHE_FILE?.trim();
  if (configuredFile) return safeAbsoluteCachePath(configuredFile, DEFAULT_ADSBDB_CACHE_FILE);
  const configuredDirectory = process.env.ADSBDB_CACHE_DIR?.trim();
  if (configuredDirectory && configuredDirectory.length <= 4_096 && configuredDirectory.startsWith("/") && !/[\0\r\n]/.test(configuredDirectory)) {
    return path.join(configuredDirectory, "adsbdb-cache-v1.json");
  }
  return DEFAULT_ADSBDB_CACHE_FILE;
}

export function getAdsbDbMetadataMaxPersistedAgeMs(): number {
  return boundedMilliseconds("ADSBDB_METADATA_MAX_STALE_MS", 7 * 24 * 60 * 60_000, 60 * 60_000, 30 * 24 * 60 * 60_000);
}

export function getAdsbDbRouteMaxPersistedAgeMs(): number {
  return boundedMilliseconds("ADSBDB_ROUTE_MAX_STALE_MS", 24 * 60 * 60_000, 60 * 60_000, 7 * 24 * 60 * 60_000);
}

export function getAdsbDbMetadataMaxPersistedEntries(): number {
  return boundedInteger("ADSBDB_METADATA_MAX_ENTRIES", 4_096, 1, 10_000);
}

export function getAdsbDbRouteMaxPersistedEntries(): number {
  return boundedInteger("ADSBDB_ROUTE_MAX_ENTRIES", 4_096, 1, 10_000);
}

export function getAircraftMetadataUrl(): string {
  return process.env.AIRCRAFT_METADATA_URL?.trim() || DEFAULT_AIRCRAFT_METADATA_URL;
}

export function getFlightAwareApiKey(): string | null {
  const key = process.env.FLIGHTAWARE_API_KEY?.trim();
  return key || null;
}

export interface OgnConfig {
  enabled: boolean;
  host: string;
  port: number;
  radiusKm: number;
  connectTimeoutMs: number;
  handshakeTimeoutMs: number;
  keepaliveMs: number;
  staleAfterMs: number;
  removeAfterMs: number;
  maxPacketAgeMs: number;
  reconnectMinMs: number;
  reconnectMaxMs: number;
  ddbRefreshMs: number;
  ddbMaxStaleMs: number;
  ddbUrl: string;
  ddbBatchSize?: number;
  ddbBatchDelayMs?: number;
  ddbMinRequestIntervalMs?: number;
  ddbNegativeTtlMs?: number;
  ddbCacheMaxEntries?: number;
  ddbPersistCache?: boolean;
  ddbCacheFile?: string;
  softrfDdbEnabled?: boolean;
  softrfDdbPath?: string;
  softrfDdbMaxAgeHours?: number;
  maxTargets: number;
  configurationError: string | null;
}

function rawNumber(name: string): number | null {
  const value = process.env[name]?.trim();
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
}

function boundedOgnMilliseconds(name: string, fallback: number, minimum: number, maximum: number): number {
  return boundedMilliseconds(name, fallback, minimum, maximum);
}

export function isOgnEnabled(): boolean {
  return process.env.OGN_ENABLED?.trim().toLowerCase() === "true";
}

export function getOgnHost(): string {
  const value = process.env.OGN_HOST?.trim();
  return value && value.length <= 253 && !/[\r\n\s]/.test(value) ? value : DEFAULT_OGN_HOST;
}

export function getOgnPort(): number {
  return boundedInteger("OGN_PORT", DEFAULT_OGN_PORT, 1, 65_535);
}

export function getOgnRadiusKm(): number {
  return boundedInteger("OGN_RADIUS_KM", 250, 1, 1_000);
}

export function getOgnConnectTimeoutMs(): number {
  return boundedOgnMilliseconds("OGN_CONNECT_TIMEOUT_MS", 10_000, 500, 120_000);
}

export function getOgnHandshakeTimeoutMs(): number {
  return boundedOgnMilliseconds("OGN_HANDSHAKE_TIMEOUT_MS", 10_000, 500, 120_000);
}

export function getOgnKeepaliveMs(): number {
  return boundedOgnMilliseconds("OGN_KEEPALIVE_MS", 240_000, 30_000, 15 * 60_000);
}

export function getOgnStaleAfterMs(): number {
  return boundedOgnMilliseconds("OGN_STALE_AFTER_MS", 15_000, 5_000, 24 * 60 * 60_000);
}

export function getOgnRemoveAfterMs(): number {
  return boundedOgnMilliseconds("OGN_REMOVE_AFTER_MS", 60_000, 5_000, 7 * 24 * 60 * 60_000);
}

export function getOgnMaxPacketAgeMs(): number {
  return boundedOgnMilliseconds("OGN_MAX_PACKET_AGE_MS", 120_000, 1_000, 24 * 60 * 60_000);
}

export function getOgnReconnectMinMs(): number {
  return boundedOgnMilliseconds("OGN_RECONNECT_MIN_MS", 1_000, 100, 60_000);
}

export function getOgnReconnectMaxMs(): number {
  return boundedOgnMilliseconds("OGN_RECONNECT_MAX_MS", 30_000, 1_000, 10 * 60_000);
}

export function getOgnDdbRefreshMs(): number {
  return boundedOgnMilliseconds("OGN_DDB_REFRESH_MS", 6 * 60 * 60_000, 60_000, 7 * 24 * 60 * 60_000);
}

export function getOgnDdbMaxStaleMs(): number {
  return boundedOgnMilliseconds("OGN_DDB_MAX_STALE_MS", 24 * 60 * 60_000, 60_000, 24 * 60 * 60_000);
}

export function getOgnDdbBatchSize(): number {
  return boundedInteger("OGN_DDB_BATCH_SIZE", DEFAULT_OGN_DDB_BATCH_SIZE, 1, 100);
}

export function getOgnDdbBatchDelayMs(): number {
  return boundedOgnMilliseconds("OGN_DDB_BATCH_DELAY_MS", DEFAULT_OGN_DDB_BATCH_DELAY_MS, 100, 60_000);
}

export function getOgnDdbMinRequestIntervalMs(): number {
  return boundedOgnMilliseconds("OGN_DDB_MIN_REQUEST_INTERVAL_MS", DEFAULT_OGN_DDB_MIN_REQUEST_INTERVAL_MS, 1_000, 60 * 60_000);
}

export function getOgnDdbNegativeTtlMs(): number {
  return boundedOgnMilliseconds("OGN_DDB_NEGATIVE_TTL_MS", DEFAULT_OGN_DDB_NEGATIVE_TTL_MS, 60_000, 7 * 24 * 60 * 60_000);
}

export function getOgnDdbCacheMaxEntries(): number {
  return boundedInteger("OGN_DDB_CACHE_MAX_ENTRIES", DEFAULT_OGN_DDB_CACHE_MAX_ENTRIES, 1, 100_000);
}

export function isOgnDdbPersistenceEnabled(): boolean {
  const configured = process.env.OGN_DDB_PERSIST_CACHE?.trim().toLowerCase();
  if (configured === "true") return true;
  if (configured === "false") return false;
  // The production unit grants the service a private StateDirectory. Keep
  // local/test processes side-effect free unless persistence is explicit.
  return process.env.NODE_ENV === "production";
}

export function getOgnDdbCacheFile(): string {
  const configured = process.env.OGN_DDB_CACHE_FILE?.trim();
  if (configured && configured.length <= 4_096 && path.isAbsolute(configured) && !/[\0\r\n]/.test(configured)) return configured;
  return DEFAULT_OGN_DDB_CACHE_FILE;
}

export function getOgnDdbUrl(): string {
  const configured = process.env.OGN_DDB_URL?.trim();
  if (!configured) return DEFAULT_OGN_DDB_URL;
  try {
    const url = new URL(configured);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if ((url.protocol !== "https:" && url.protocol !== "http:") || host !== "ddb.glidernet.org" || url.port || url.username || url.password || url.pathname !== "/download/") return DEFAULT_OGN_DDB_URL;
    return url.toString();
  } catch {
    return DEFAULT_OGN_DDB_URL;
  }
}

export function isOgnSoftRfDdbEnabled(): boolean {
  return process.env.OGN_SOFTRF_DDB_ENABLED?.trim().toLowerCase() === "true";
}

export function getOgnSoftRfDdbPath(): string {
  const configured = process.env.OGN_SOFTRF_DDB_PATH?.trim();
  return configured && configured.length <= 4_096 && path.isAbsolute(configured) && !/[\0\r\n]/.test(configured)
    ? configured
    : DEFAULT_OGN_SOFTRF_DDB_PATH;
}

export function getOgnSoftRfDdbMaxAgeHours(): number {
  return boundedInteger("OGN_SOFTRF_DDB_MAX_AGE_HOURS", DEFAULT_OGN_SOFTRF_DDB_MAX_AGE_HOURS, 1, 24 * 365);
}

export function getOgnMaxTargets(): number {
  return boundedInteger("OGN_MAX_TARGETS", 5_000, 1, 20_000);
}

export function getOgnConfig(): OgnConfig {
  const staleAfterMs = getOgnStaleAfterMs();
  const removeAfterMs = getOgnRemoveAfterMs();
  const reconnectMinMs = getOgnReconnectMinMs();
  const reconnectMaxMs = getOgnReconnectMaxMs();
  const ddbRefreshMs = getOgnDdbRefreshMs();
  const ddbMaxStaleMs = getOgnDdbMaxStaleMs();
  const ddbBatchSize = getOgnDdbBatchSize();
  const ddbBatchDelayMs = getOgnDdbBatchDelayMs();
  const ddbMinRequestIntervalMs = getOgnDdbMinRequestIntervalMs();
  const ddbNegativeTtlMs = getOgnDdbNegativeTtlMs();
  const ddbCacheMaxEntries = getOgnDdbCacheMaxEntries();
  const ddbPersistCache = isOgnDdbPersistenceEnabled();
  const ddbCacheFile = getOgnDdbCacheFile();
  const softrfDdbEnabled = isOgnSoftRfDdbEnabled();
  const softrfDdbPath = getOgnSoftRfDdbPath();
  const softrfDdbMaxAgeHours = getOgnSoftRfDdbMaxAgeHours();
  const ddbUrl = getOgnDdbUrl();
  const errors: string[] = [];
  const host = process.env.OGN_HOST?.trim();
  const port = rawNumber("OGN_PORT");
  const radius = rawNumber("OGN_RADIUS_KM");
  const receiverLat = rawNumber("RECEIVER_LAT");
  const receiverLon = rawNumber("RECEIVER_LON");
  if (host && (host.length > 253 || /[\r\n\s]/.test(host))) errors.push("OGN_HOST");
  if (port !== null && (!Number.isInteger(port) || port < 1 || port > 65_535)) errors.push("OGN_PORT");
  if (radius !== null && (!Number.isInteger(radius) || radius < 1 || radius > 1_000)) errors.push("OGN_RADIUS_KM");
  if (receiverLat !== null && (!Number.isFinite(receiverLat) || receiverLat < -90 || receiverLat > 90)) errors.push("RECEIVER_LAT");
  if (receiverLon !== null && (!Number.isFinite(receiverLon) || receiverLon < -180 || receiverLon > 180)) errors.push("RECEIVER_LON");
  if (removeAfterMs < staleAfterMs) errors.push("OGN_REMOVE_AFTER_MS");
  if (reconnectMaxMs < reconnectMinMs) errors.push("OGN_RECONNECT_MAX_MS");
  if (ddbMaxStaleMs < ddbRefreshMs) errors.push("OGN_DDB_MAX_STALE_MS");
  const configuredDdbUrl = process.env.OGN_DDB_URL?.trim();
  if (configuredDdbUrl && ddbUrl === DEFAULT_OGN_DDB_URL && configuredDdbUrl !== DEFAULT_OGN_DDB_URL) errors.push("OGN_DDB_URL");
  return {
    enabled: isOgnEnabled(),
    host: getOgnHost(),
    port: getOgnPort(),
    radiusKm: getOgnRadiusKm(),
    connectTimeoutMs: getOgnConnectTimeoutMs(),
    handshakeTimeoutMs: getOgnHandshakeTimeoutMs(),
    keepaliveMs: getOgnKeepaliveMs(),
    staleAfterMs,
    removeAfterMs,
    maxPacketAgeMs: getOgnMaxPacketAgeMs(),
    reconnectMinMs,
    reconnectMaxMs,
    ddbRefreshMs,
    ddbMaxStaleMs,
    ddbUrl,
    ddbBatchSize,
    ddbBatchDelayMs,
    ddbMinRequestIntervalMs,
    ddbNegativeTtlMs,
    ddbCacheMaxEntries,
    ddbPersistCache,
    ddbCacheFile,
    softrfDdbEnabled,
    softrfDdbPath,
    softrfDdbMaxAgeHours,
    maxTargets: getOgnMaxTargets(),
    configurationError: errors.length ? `Invalid OGN configuration: ${errors.join(", ")}` : null,
  };
}

export function isAviationWeatherEnabled(): boolean {
  return process.env.AVIATION_WEATHER_ENABLED?.trim().toLowerCase() === "true";
}

function boundedMilliseconds(name: string, fallback: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.trunc(envNumber(name, fallback))));
}

export function getAviationWeatherBaseUrl(): string {
  const configured = process.env.AVIATION_WEATHER_BASE_URL?.trim();
  if (!configured) return DEFAULT_AVIATION_WEATHER_BASE_URL;
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" || url.hostname.toLowerCase().replace(/\.$/, "") !== "aviationweather.gov") {
      return DEFAULT_AVIATION_WEATHER_BASE_URL;
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return DEFAULT_AVIATION_WEATHER_BASE_URL;
  }
}

export function getAviationWeatherRequestTimeoutMs(): number {
  return boundedMilliseconds("AVIATION_WEATHER_REQUEST_TIMEOUT_MS", 5_000, 500, 60_000);
}

export function getAviationWeatherMetarTtlMs(): number {
  return boundedMilliseconds("AVIATION_WEATHER_METAR_TTL_MS", 5 * 60_000, 1_000, 24 * 60 * 60_000);
}

export function getAviationWeatherTafTtlMs(): number {
  return boundedMilliseconds("AVIATION_WEATHER_TAF_TTL_MS", 10 * 60_000, 1_000, 24 * 60 * 60_000);
}

export function getAviationWeatherSigmetTtlMs(): number {
  return boundedMilliseconds("AVIATION_WEATHER_SIGMET_TTL_MS", 5 * 60_000, 1_000, 24 * 60 * 60_000);
}

export function getAviationWeatherStaleIfErrorMs(): number {
  return boundedMilliseconds("AVIATION_WEATHER_STALE_IF_ERROR_MS", 30 * 60_000, 1_000, 7 * 24 * 60 * 60_000);
}

export function isAviationWeatherPersistenceEnabled(): boolean {
  const configured = (process.env.AVIATION_WEATHER_PERSIST_CACHE ?? process.env.AVIATION_WEATHER_PERSISTENCE)?.trim().toLowerCase();
  if (configured !== undefined && configured !== "") return configured === "true";
  return process.env.NODE_ENV === "production";
}

export function getAviationWeatherCacheFile(): string {
  const configured = process.env.AVIATION_WEATHER_CACHE_FILE?.trim();
  if (configured && configured.length <= 4_096 && configured.startsWith("/") && !/[\0\r\n]/.test(configured)) return configured;
  const directory = process.env.AVIATION_WEATHER_CACHE_DIR?.trim();
  if (directory && directory.length <= 4_096 && directory.startsWith("/") && !/[\0\r\n]/.test(directory)) return path.join(directory, "weather-cache-v1.json");
  return DEFAULT_AVIATION_WEATHER_CACHE_FILE;
}

export function getAviationWeatherMetarMaxPersistedAgeMs(): number {
  return boundedMilliseconds("AVIATION_WEATHER_METAR_MAX_PERSISTED_AGE_MS", 2 * 60 * 60_000, 60 * 60_000, 7 * 24 * 60 * 60_000);
}

export function getAviationWeatherTafMaxPersistedAgeMs(): number {
  return boundedMilliseconds("AVIATION_WEATHER_TAF_MAX_PERSISTED_AGE_MS", 24 * 60 * 60_000, 60 * 60_000, 7 * 24 * 60 * 60_000);
}

export function getAviationWeatherSigmetMaxPersistedAgeMs(): number {
  return boundedMilliseconds("AVIATION_WEATHER_SIGMET_MAX_PERSISTED_AGE_MS", 24 * 60 * 60_000, 60 * 60_000, 7 * 24 * 60 * 60_000);
}

export function getAviationWeatherUserAgent(): string {
  const configured = process.env.AVIATION_WEATHER_USER_AGENT?.trim();
  if (configured && configured.length <= 200 && !/[\r\n]/.test(configured)) return configured;
  return getAirRadarUserAgent("aviation-weather");
}

export function getWatchlistAdminToken(): string | null {
  const token = process.env.WATCHLIST_ADMIN_TOKEN?.trim();
  return token || null;
}
