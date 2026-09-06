import { haversineDistanceKm, initialBearing } from "@/lib/geo";
import type { Aircraft, AircraftSource, ReceiverPosition } from "@/lib/aircraft/types";

export interface RawReadsbAircraft {
  hex?: unknown;
  flight?: unknown;
  callsign?: unknown;
  r?: unknown;
  t?: unknown;
  desc?: unknown;
  lat?: unknown;
  lon?: unknown;
  alt_baro?: unknown;
  alt_geom?: unknown;
  gs?: unknown;
  track?: unknown;
  baro_rate?: unknown;
  geom_rate?: unknown;
  squawk?: unknown;
  rssi?: unknown;
  messages?: unknown;
  seen?: unknown;
  seen_pos?: unknown;
  type?: unknown;
  mlat?: unknown;
  tisb?: unknown;
  dbFlags?: unknown;
  on_ground?: unknown;
  emergency?: unknown;
}

export interface RawReadsbAircraftResponse {
  now?: unknown;
  messages?: unknown;
  aircraft?: RawReadsbAircraft[];
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function emergency(value: unknown): string | null {
  const normalized = text(value)?.toLowerCase() ?? null;
  return normalized && normalized !== "none" && normalized !== "unknown" ? normalized : null;
}

function sourceFor(raw: RawReadsbAircraft): AircraftSource {
  const explicit = text(raw.type)?.toLowerCase();
  if (explicit?.includes("mlat") || raw.mlat === true) return "MLAT";
  if (explicit?.includes("tisb") || raw.tisb === true) return "TIS-B";
  if (explicit?.includes("adsb") || raw.mlat === false) return "ADS-B";
  return "UNKNOWN";
}

function isOnGround(raw: RawReadsbAircraft, altitude: number | null): boolean {
  if (typeof raw.on_ground === "boolean") return raw.on_ground;
  return typeof raw.alt_baro === "string" && raw.alt_baro.toLowerCase() === "ground" || altitude === null;
}

export function normalizeAircraft(raw: RawReadsbAircraft, receiver: ReceiverPosition, now = new Date()): Aircraft | null {
  const icaoHex = text(raw.hex)?.toUpperCase();
  if (!icaoHex) return null;

  const lat = numeric(raw.lat);
  const lon = numeric(raw.lon);
  const altitude = numeric(raw.alt_geom) ?? numeric(raw.alt_baro);
  const distanceKm = lat !== null && lon !== null ? haversineDistanceKm(receiver.lat, receiver.lon, lat, lon) : null;
  const bearing = lat !== null && lon !== null ? initialBearing(receiver.lat, receiver.lon, lat, lon) : null;
  const seenSeconds = numeric(raw.seen);
  const lastSeen = new Date(now.getTime() - Math.max(0, seenSeconds ?? 0) * 1000).toISOString();

  return {
    icaoHex,
    callsign: text(raw.flight) ?? text(raw.callsign),
    registration: text(raw.r),
    aircraftType: text(raw.t),
    aircraftDescription: text(raw.desc),
    lat,
    lon,
    altitude,
    groundSpeed: numeric(raw.gs),
    track: numeric(raw.track),
    verticalRate: numeric(raw.geom_rate) ?? numeric(raw.baro_rate),
    squawk: text(raw.squawk),
    emergency: emergency(raw.emergency),
    rssi: numeric(raw.rssi),
    messages: numeric(raw.messages),
    lastSeen,
    source: sourceFor(raw),
    onGround: isOnGround(raw, altitude),
    distanceKm,
    bearing,
    trail: lat !== null && lon !== null ? [{ lat, lon, recordedAt: now.toISOString() }] : [],
  };
}

export function normalizeAircraftResponse(
  response: RawReadsbAircraftResponse,
  receiver: ReceiverPosition,
  now = new Date(),
): Aircraft[] {
  return (Array.isArray(response.aircraft) ? response.aircraft : [])
    .map((raw) => normalizeAircraft(raw, receiver, now))
    .filter((aircraft): aircraft is Aircraft => aircraft !== null);
}
