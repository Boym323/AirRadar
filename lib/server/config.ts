import type { ReceiverPosition } from "@/lib/aircraft/types";
import { t } from "@/lib/i18n";

export const DEFAULT_APP_TIMEZONE = "Europe/Prague";

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

export function getReceiverRefreshIntervalMs(): number {
  return Math.max(60_000, envNumber("RECEIVER_REFRESH_INTERVAL_MS", 5 * 60_000));
}

export function isAdsbDbEnabled(): boolean {
  return process.env.ADSBDB_ENABLED?.trim().toLowerCase() === "true";
}

export function getAdsbDbBaseUrl(): string {
  return process.env.ADSBDB_BASE_URL?.trim() || "https://api.adsbdb.com/v0";
}

export function getFlightAwareApiKey(): string | null {
  const key = process.env.FLIGHTAWARE_API_KEY?.trim();
  return key || null;
}
