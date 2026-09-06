import type { ReceiverPosition } from "@/lib/aircraft/types";

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

export function getReceiverPosition(): ReceiverPosition {
  return {
    lat: envNumber("RECEIVER_LAT", 50.0755),
    lon: envNumber("RECEIVER_LON", 14.4378),
    name: process.env.RECEIVER_NAME?.trim() || "AirRadar receiver",
  };
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
