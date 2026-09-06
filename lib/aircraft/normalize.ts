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
  category?: unknown;
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

function coordinate(value: unknown, minimum: number, maximum: number): number | null {
  const parsed = numeric(value);
  return parsed !== null && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function emergency(value: unknown): string | null {
  const normalized = text(value)?.toLowerCase() ?? null;
  return normalized && normalized !== "none" && normalized !== "unknown" ? normalized : null;
}

function sourceFor(raw: RawReadsbAircraft): AircraftSource {
  const explicit = text(raw.type)?.toLowerCase();
  if (explicit === "mlat" || explicit?.startsWith("mlat_")) return "MLAT";
  if (explicit?.startsWith("tisb")) return "TIS-B";
  if (explicit === "mode_s" || explicit === "mode-s") return "Mode-S";
  if (explicit?.startsWith("adsb") || explicit?.startsWith("adsr")) return "ADS-B";
  if (raw.mlat === true || Array.isArray(raw.mlat) && raw.mlat.length > 0) return "MLAT";
  if (raw.tisb === true || Array.isArray(raw.tisb) && raw.tisb.length > 0) return "TIS-B";
  return "UNKNOWN";
}

function isOnGround(raw: RawReadsbAircraft): boolean {
  if (typeof raw.on_ground === "boolean") return raw.on_ground;
  const onGround = text(raw.on_ground)?.toLowerCase();
  if (onGround === "true" || onGround === "ground") return true;
  if (onGround === "false" || onGround === "air") return false;
  return typeof raw.alt_baro === "string" && raw.alt_baro.toLowerCase() === "ground";
}

export function normalizeAircraft(raw: RawReadsbAircraft, receiver: ReceiverPosition, now = new Date()): Aircraft | null {
  const icaoHex = text(raw.hex)?.toUpperCase();
  if (!icaoHex) return null;

  const lat = coordinate(raw.lat, -90, 90);
  const lon = coordinate(raw.lon, -180, 180);
  const baroAltitude = numeric(raw.alt_baro);
  const geomAltitude = numeric(raw.alt_geom);
  const altitude = geomAltitude ?? baroAltitude;
  const distanceKm = lat !== null && lon !== null ? haversineDistanceKm(receiver.lat, receiver.lon, lat, lon) : null;
  const bearing = lat !== null && lon !== null ? initialBearing(receiver.lat, receiver.lon, lat, lon) : null;
  const seenSecondsValue = numeric(raw.seen);
  const seenSeconds = seenSecondsValue !== null && seenSecondsValue >= 0 ? seenSecondsValue : null;
  const seenPosSecondsValue = numeric(raw.seen_pos);
  const seenPosSeconds = seenPosSecondsValue !== null && seenPosSecondsValue >= 0 ? seenPosSecondsValue : null;
  const lastSeen = new Date(now.getTime() - (seenSeconds ?? 0) * 1000).toISOString();

  return {
    icaoHex,
    callsign: text(raw.flight) ?? text(raw.callsign),
    registration: text(raw.r),
    aircraftType: text(raw.t),
    aircraftDescription: text(raw.desc),
    lat,
    lon,
    altitude,
    baroAltitude,
    geomAltitude,
    groundSpeed: numeric(raw.gs),
    track: numeric(raw.track),
    verticalRate: numeric(raw.geom_rate) ?? numeric(raw.baro_rate),
    baroRate: numeric(raw.baro_rate),
    geomRate: numeric(raw.geom_rate),
    squawk: text(raw.squawk),
    category: text(raw.category),
    emergency: emergency(raw.emergency),
    rssi: numeric(raw.rssi),
    messages: numeric(raw.messages),
    seenSeconds,
    seenPosSeconds,
    lastSeen,
    source: sourceFor(raw),
    sourceType: text(raw.type),
    onGround: isOnGround(raw),
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
  const generatedAt = numeric(response.now);
  const observedAt = generatedAt !== null ? new Date(generatedAt * 1000) : now;
  const normalizationTime = Number.isNaN(observedAt.getTime()) ? now : observedAt;
  return (Array.isArray(response.aircraft) ? response.aircraft : [])
    .map((raw) => normalizeAircraft(raw, receiver, normalizationTime))
    .filter((aircraft): aircraft is Aircraft => aircraft !== null);
}
