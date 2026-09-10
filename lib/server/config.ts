import type { ReceiverPosition } from "@/lib/aircraft/types";
import { t } from "@/lib/i18n";
import { getAirRadarUserAgent } from "@/lib/server/user-agent";

export const DEFAULT_APP_TIMEZONE = "Europe/Prague";
export const DEFAULT_AIRCRAFT_METADATA_URL = "https://raw.githubusercontent.com/wiedehopf/tar1090-db/refs/heads/csv/aircraft.csv.gz";
export const DEFAULT_AVIATION_WEATHER_BASE_URL = "https://aviationweather.gov";

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

export function getAircraftMetadataUrl(): string {
  return process.env.AIRCRAFT_METADATA_URL?.trim() || DEFAULT_AIRCRAFT_METADATA_URL;
}

export function getFlightAwareApiKey(): string | null {
  const key = process.env.FLIGHTAWARE_API_KEY?.trim();
  return key || null;
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

export function getAviationWeatherUserAgent(): string {
  const configured = process.env.AVIATION_WEATHER_USER_AGENT?.trim();
  if (configured && configured.length <= 200 && !/[\r\n]/.test(configured)) return configured;
  return getAirRadarUserAgent("aviation-weather");
}

export function getWatchlistAdminToken(): string | null {
  const token = process.env.WATCHLIST_ADMIN_TOKEN?.trim();
  return token || null;
}
