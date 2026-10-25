/**
 * R-02: read-only candidate adapter for the existing AirRadarV2 Rust/Axum API.
 * Not registered as an AircraftProvider by V1: no production cutover is allowed
 * until parity and operational acceptance are complete.
 */
import { normalizeAircraft, type RawReadsbAircraft } from "@/lib/aircraft/normalize";
import type { ProviderSnapshot, ReceiverPosition } from "@/lib/aircraft/types";

type JsonObject = Record<string, unknown>;
const IDENTIFIER = /^(icao|nonicao):([0-9a-f]{6})$/;
const SQUAWK = /^[0-7]{4}$/;
const CATEGORIES = new Set(["A1", "A2", "A3", "A4", "A5", "A6", "A7", "B1", "B2", "B4", "B6", "C1", "C2"]);
const ORIGINS = new Set(["adsb", "adsb_cpr", "mlat", "tisb", "rebroadcast", "estimated", "unknown"]);
const MAX_SNAPSHOT_AGE_MS = 30_000;
const MAX_MESSAGE_AGE_S = 30;
const MAX_POSITION_AGE_S = 15;

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}
function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function validNumber(value: unknown, min: number, max: number): number | null {
  const number = finite(value);
  return number !== null && number >= min && number <= max ? number : null;
}
function optionalNumber(value: unknown, min: number, max: number): number | null {
  if (value === undefined || value === null) return null;
  const number = validNumber(value, min, max);
  if (number === null) throw new Error("Invalid Rust V2 flight telemetry");
  return number;
}
function optionalText(value: unknown, pattern: RegExp): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !pattern.test(value)) throw new Error("Invalid Rust V2 identity field");
  return value;
}

/**
 * This is intentionally a pure conversion, not a production provider.
 * V2 does not yet carry every V1 field (registration, geom altitude, Comm-B,
 * receiver statistics); missing values stay unknown instead of being invented.
 */
export function rustV2ToV1Candidate(
  payload: unknown, receiver: ReceiverPosition, observedAt: Date = new Date(),
): ProviderSnapshot {
  const wrapper = object(payload);
  const snapshot = object(wrapper?.data);
  if (wrapper?.status !== "live" || snapshot?.kind !== "snapshot"
    || typeof snapshot.epoch !== "string" || !snapshot.epoch
    || !Number.isSafeInteger(snapshot.seq) || (snapshot.seq as number) < 0
    || typeof snapshot.generatedAt !== "string" || !Array.isArray(snapshot.aircraft)
    || snapshot.aircraft.length > 5000) {
    throw new Error("Rust V2 snapshot is missing, degraded or invalid");
  }
  const generatedMs = Date.parse(snapshot.generatedAt);
  if (!Number.isFinite(generatedMs) || !Number.isFinite(observedAt.getTime())
    || Math.abs(observedAt.getTime() - generatedMs) > MAX_SNAPSHOT_AGE_MS) {
    throw new Error("Rust V2 snapshot is not fresh");
  }
  const generatedSeconds = generatedMs / 1000;
  const aircraft: ProviderSnapshot["aircraft"] = [];
  const identities = new Set<string>();
  for (const value of snapshot.aircraft) {
    const row = object(value);
    if (!row || typeof row.id !== "string") throw new Error("Invalid Rust V2 aircraft");
    const identity = IDENTIFIER.exec(row.id);
    if (!identity || identities.has(row.id)) throw new Error("Invalid or duplicate Rust V2 identity");
    identities.add(row.id);
    const messageAt = finite(row.lastMessageAt);
    if (messageAt === null || messageAt < 0 || messageAt > generatedSeconds + 2
      || typeof row.stale !== "boolean" || !ORIGINS.has(String(row.positionOrigin))) {
      throw new Error("Invalid Rust V2 observation");
    }
    const seen = Math.max(0, generatedSeconds - messageAt);
    if (seen > MAX_MESSAGE_AGE_S || row.stale) continue;
    const telemetry = object(row.telemetry) ?? {};
    const callsign = optionalText(row.callsign, /^[A-Za-z0-9-]{1,8}$/);
    const squawk = optionalText(row.squawk, SQUAWK);
    const category = optionalText(row.emitterCategory, /^[A-C][0-9]$/);
    if (category !== null && !CATEGORIES.has(category)) throw new Error("Invalid Rust V2 category");
    const position = row.position === null ? null : object(row.position);
    if (row.position !== null && position === null) throw new Error("Invalid Rust V2 position");
    const posAt = row.lastPositionAt === null ? null : finite(row.lastPositionAt);
    if (row.lastPositionAt !== null && posAt === null) throw new Error("Invalid Rust V2 position time");
    const lat = position === null ? null : validNumber(position.lat, -90, 90);
    const lon = position === null ? null : validNumber(position.lon, -180, 180);
    if (position !== null && (lat === null || lon === null)) throw new Error("Invalid Rust V2 coordinates");
    const positionAge = posAt === null ? null : generatedSeconds - posAt;
    const usablePosition = lat !== null && lon !== null && positionAge !== null
      && positionAge >= -2 && positionAge <= MAX_POSITION_AGE_S
      && row.positionOrigin !== "estimated" && row.positionOrigin !== "unknown";
    const type = row.positionOrigin === "mlat" ? "mlat"
      : row.positionOrigin === "tisb" ? "tisb_icao"
      : row.positionOrigin === "rebroadcast" ? "adsr_icao"
      : row.positionOrigin === "adsb" || row.positionOrigin === "adsb_cpr" ? "adsb_icao" : "unknown";
    const onGround = telemetry.onGround;
    if (onGround !== undefined && typeof onGround !== "boolean") throw new Error("Invalid Rust V2 ground state");
    const raw: RawReadsbAircraft = {
      hex: identity[1] === "nonicao" ? `~${identity[2]}` : identity[2],
      flight: callsign,
      squawk,
      category,
      type,
      seen,
      ...(usablePosition ? { lat, lon, seen_pos: Math.max(0, positionAge!) } : {}),
      ...(onGround === true ? { alt_baro: "ground" } : {}),
      ...((onGround !== true && telemetry.altitudeBaroFt !== undefined)
        ? { alt_baro: optionalNumber(telemetry.altitudeBaroFt, -2000, 65000) } : {}),
      gs: optionalNumber(telemetry.groundSpeedKt, 0, 1500),
      track: optionalNumber(telemetry.trackDegrees, 0, 360),
      baro_rate: optionalNumber(telemetry.verticalRateFpm, -15000, 15000),
      ...(onGround === undefined ? {} : { on_ground: onGround }),
    };
    const candidate = normalizeAircraft(raw, receiver, new Date(generatedMs));
    if (!candidate) throw new Error("Rust V2 candidate normalization failed");
    aircraft.push(candidate);
  }
  return {
    aircraft,
    receiver,
    fetchedAt: new Date(generatedMs).toISOString(),
    provider: "rust-v2-candidate",
    messagesPerSecond: null, // V2 does not expose a comparable receiver counter.
  };
}
