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
