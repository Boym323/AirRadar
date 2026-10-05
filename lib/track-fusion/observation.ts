import type { Aircraft, AircraftFieldProvenance } from "@/lib/aircraft/types";
import { positionObservedAt } from "@/lib/aircraft/source-merge";
import type {
  TrackFusionConfidence,
  TrackFusionFieldCandidate,
  TrackFusionFieldName,
  TrackFusionIntegrity,
  TrackFusionPositionValue,
  TrackFusionSourceClass,
} from "./types";

const MAX_FIELD_AGE_MS = 60_000;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function aircraftOrigin(aircraft: Aircraft): "local" | "adsblol" | "adsbhub" {
  return aircraft.origin ?? "local";
}

function sourceClass(aircraft: Aircraft): TrackFusionSourceClass {
  return aircraftOrigin(aircraft) === "local" ? "LOCAL" : "NETWORK";
}

function fieldProvenance(aircraft: Aircraft, keys: string[]): AircraftFieldProvenance | null {
  const fields = aircraft.provenance?.fields;
  if (!fields) return null;
  for (const key of keys) {
    const value = fields[key];
    if (value) return value;
  }
  return null;
}

function lastMessageObservedAt(aircraft: Aircraft): number | null {
  const lastSeen = Date.parse(aircraft.lastSeen);
  if (!Number.isFinite(lastSeen)) return null;
  const seenMs = finite(aircraft.seenSeconds) && aircraft.seenSeconds >= 0 ? aircraft.seenSeconds * 1000 : 0;
  return lastSeen - seenMs;
}

function observationTime(
  aircraft: Aircraft,
  field: TrackFusionFieldName,
  provenance: AircraftFieldProvenance | null,
): number | null {
  if (provenance) {
    const parsed = Date.parse(provenance.observedAt);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (field === "position") return positionObservedAt(aircraft) ?? lastMessageObservedAt(aircraft);
  const times = aircraft.observationTimes;
  const key = field === "altitude" ? "altitude" : field;
  const timestamp = times?.[key as keyof typeof times];
  if (finite(timestamp) && timestamp > 0) return timestamp;
  return lastMessageObservedAt(aircraft);
}

function integrity(aircraft: Aircraft): TrackFusionIntegrity {
  return {
    nic: aircraft.adsbTelemetry?.nic ?? null,
    nacP: aircraft.adsbTelemetry?.nacP ?? aircraft.targetState?.nacp ?? aircraft.operationalStatus?.nacp ?? null,
    nacV: aircraft.adsbTelemetry?.nacV ?? null,
    sil: aircraft.adsbTelemetry?.sil ?? aircraft.targetState?.sil ?? aircraft.operationalStatus?.sil ?? null,
    sda: aircraft.adsbTelemetry?.sda ?? null,
    containmentRadiusM: aircraft.adsbTelemetry?.containmentRadiusM ?? null,
  };
}

function sourceBaseScore(aircraft: Aircraft): number {
  const source = aircraft.source;
  const base = source === "ADS-B" ? 78
    : source === "MLAT" ? 58
      : source === "TIS-B" ? 50
        : source === "Mode-S" ? 45
          : 38;
  return base + (sourceClass(aircraft) === "LOCAL" ? 12 : 0);
}

function protocolBonus(protocol: string): number {
  if (protocol === "beast-mode-s") return 5;
  if (protocol === "readsb-json") return 3;
  if (protocol === "sbs") return -2;
  return 0;
}

function integrityBonus(field: TrackFusionFieldName, data: TrackFusionIntegrity): number {
  if (field === "position") {
    const nac = data.nacP ?? data.nic;
    if (nac === null) return 0;
    if (nac >= 10) return 8;
    if (nac >= 8) return 6;
    if (nac >= 6) return 3;
    if (nac <= 3) return -8;
    return 0;
  }
  if (field === "groundSpeed" || field === "track" || field === "verticalRate") {
    const nacV = data.nacV;
    if (nacV === null) return 0;
    if (nacV >= 3) return 5;
    if (nacV === 2) return 2;
    if (nacV === 0) return -5;
  }
  return 0;
}

function freshnessScore(ageMs: number): number {
  if (ageMs <= 2_000) return 8;
  if (ageMs <= 5_000) return 5;
  if (ageMs <= 15_000) return 0;
  if (ageMs <= 30_000) return -10;
  return -25;
}

function confidence(score: number): TrackFusionConfidence {
  if (score >= 88) return "HIGH";
  if (score >= 68) return "MEDIUM";
  return "LOW";
}

function candidate<T>(
  aircraft: Aircraft,
  field: TrackFusionFieldName,
  keys: string[],
  value: T | null,
  now: number,
): TrackFusionFieldCandidate<T> | null {
  if (value === null) return null;
  const provenance = fieldProvenance(aircraft, keys);
  const observedAt = observationTime(aircraft, field, provenance);
  if (observedAt === null || observedAt > now + 5_000) return null;
  const ageMs = Math.max(0, now - observedAt);
  if (ageMs > MAX_FIELD_AGE_MS) return null;
  const data = integrity(aircraft);
  const protocol = provenance?.protocol ?? "unknown";
  const score = Math.max(0, Math.min(100,
    sourceBaseScore(aircraft)
    + protocolBonus(protocol)
    + integrityBonus(field, data)
    + freshnessScore(ageMs),
  ));
  return {
    field,
    value,
    observedAt,
    sourceClass: sourceClass(aircraft),
    origin: aircraftOrigin(aircraft),
    source: aircraft.source,
    protocol,
    score,
    confidence: confidence(score),
    ageMs,
    integrity: data,
  };
}

export interface TrackFusionObservation {
  icaoHex: string;
  sourceClass: TrackFusionSourceClass;
  origin: "local" | "adsblol" | "adsbhub";
  source: Aircraft["source"];
  fingerprint: string;
  position: TrackFusionFieldCandidate<TrackFusionPositionValue> | null;
  altitude: TrackFusionFieldCandidate<number> | null;
  groundSpeed: TrackFusionFieldCandidate<number> | null;
  track: TrackFusionFieldCandidate<number> | null;
  verticalRate: TrackFusionFieldCandidate<number> | null;
}

export function buildTrackFusionObservation(aircraft: Aircraft, now = Date.now()): TrackFusionObservation {
  const positionValue = finite(aircraft.lat) && finite(aircraft.lon)
    && aircraft.lat >= -90 && aircraft.lat <= 90 && aircraft.lon >= -180 && aircraft.lon <= 180
    ? { lat: aircraft.lat, lon: aircraft.lon }
    : null;
  const altitudeValue = finite(aircraft.altitude) ? aircraft.altitude : null;
  const speedValue = finite(aircraft.groundSpeed) && aircraft.groundSpeed >= 0 ? aircraft.groundSpeed : null;
  const trackValue = finite(aircraft.track) ? ((aircraft.track % 360) + 360) % 360 : null;
  const verticalRateValue = finite(aircraft.verticalRate) ? aircraft.verticalRate : null;

  const position = candidate(aircraft, "position", ["position", "lat", "lon"], positionValue, now);
  const altitude = candidate(aircraft, "altitude", ["altitude", "baroAltitude", "geomAltitude"], altitudeValue, now);
  const groundSpeed = candidate(aircraft, "groundSpeed", ["groundSpeed", "ground_speed", "gs"], speedValue, now);
  const track = candidate(aircraft, "track", ["track", "heading"], trackValue, now);
  const verticalRate = candidate(aircraft, "verticalRate", ["verticalRate", "baroRate", "geomRate"], verticalRateValue, now);
  const parts = [position, altitude, groundSpeed, track, verticalRate]
    .map((item) => item ? `${item.field}:${item.observedAt}:${item.score}` : "-")
    .join("|");

  return {
    icaoHex: aircraft.icaoHex.toUpperCase(),
    sourceClass: sourceClass(aircraft),
    origin: aircraftOrigin(aircraft),
    source: aircraft.source,
    fingerprint: `${aircraft.icaoHex}|${aircraft.lastSeen}|${parts}`,
    position,
    altitude,
    groundSpeed,
    track,
    verticalRate,
  };
}

export function positionUncertaintyNm(candidate: TrackFusionFieldCandidate<TrackFusionPositionValue>): number {
  const radiusM = candidate.integrity.containmentRadiusM;
  let base: number;
  if (finite(radiusM) && radiusM > 0) {
    base = Math.max(0.01, radiusM / 1852);
  } else if (candidate.source === "MLAT") {
    base = candidate.sourceClass === "LOCAL" ? 0.35 : 0.6;
  } else {
    const nac = candidate.integrity.nacP ?? candidate.integrity.nic;
    base = nac !== null && nac >= 10 ? 0.03
      : nac !== null && nac >= 8 ? 0.08
        : nac !== null && nac >= 6 ? 0.25
          : nac !== null && nac >= 4 ? 0.8
            : 1.5;
  }
  return Number((base + candidate.ageMs / 1000 * 0.015).toFixed(3));
}

export function fieldUncertainty(field: Exclude<TrackFusionFieldName, "position">, candidate: TrackFusionFieldCandidate<number>): number {
  const sourcePenalty = candidate.source === "ADS-B" ? 1 : candidate.source === "MLAT" ? 1.8 : 2.5;
  const ageFactor = 1 + candidate.ageMs / 30_000;
  const base = field === "altitude" ? 50
    : field === "groundSpeed" ? 3
      : field === "track" ? 2
        : 100;
  return Number((base * sourcePenalty * ageFactor).toFixed(2));
}
