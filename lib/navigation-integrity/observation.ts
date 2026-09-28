import type { Aircraft, AircraftFieldProvenance } from "@/lib/aircraft/types";
import { hasUsablePosition, positionObservedAt } from "@/lib/aircraft/source-merge";
import { altitudeBand } from "@/lib/navigation-integrity/grid";
import type { NavigationIntegrityObservation } from "@/lib/navigation-integrity/types";

export const NAVIGATION_INTEGRITY_LIMITS = Object.freeze({
  maxPositionAgeMs: 45_000,
  maxIntegrityAgeMs: 90_000,
  maxPositionIntegritySkewMs: 90_000,
});

function finite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function fieldAt(aircraft: Aircraft, field: string, fallback: number): number {
  const observedAt = aircraft.provenance?.fields?.[field]?.observedAt;
  const parsed = observedAt ? Date.parse(observedAt) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function field(aircraft: Aircraft, field: string): AircraftFieldProvenance | null {
  return aircraft.provenance?.fields?.[field] ?? null;
}

function sourceFor(aircraft: Aircraft): "LOCAL" | "NETWORK" {
  return aircraft.origin === "local" || aircraft.provenance?.positionOrigin === "local" ? "LOCAL" : "NETWORK";
}

function qualityFor(aircraft: Aircraft, fields: number, ages: number[]): "HIGH" | "MEDIUM" | "LOW" {
  const local = sourceFor(aircraft) === "LOCAL";
  if (local && fields >= 3 && ages.every((age) => age <= 30_000)) return "HIGH";
  if (fields >= 2 && ages.every((age) => age <= 60_000)) return "MEDIUM";
  return "LOW";
}

export function observationFromAircraft(aircraft: Aircraft, receivedAt = new Date()): NavigationIntegrityObservation | null {
  if (!hasUsablePosition(aircraft)) return null;
  const receivedMs = receivedAt.getTime();
  const positionAt = positionObservedAt(aircraft);
  if (positionAt === null || receivedMs - positionAt > NAVIGATION_INTEGRITY_LIMITS.maxPositionAgeMs) return null;
  if (aircraft.origin !== "local" && aircraft.origin !== "adsblol" && !aircraft.provenance?.positionOrigin) return null;
  if (aircraft.onGround) return null;

  const telemetry = aircraft.adsbTelemetry;
  const operational = aircraft.operationalStatus;
  const values = {
    nic: finite(telemetry?.nic),
    nacP: finite(telemetry?.nacP ?? operational?.nacp),
    nacV: finite(telemetry?.nacV),
    sil: finite(telemetry?.sil ?? operational?.sil),
    sda: finite(telemetry?.sda),
    gva: finite(telemetry?.gva),
    adsbVersion: finite(telemetry?.adsbVersion ?? operational?.adsbVersion),
  };
  const integrityFields = (Object.entries(values) as Array<[keyof typeof values, number | null]>).filter(([, value]) => value !== null);
  if (!integrityFields.length) return null;

  const fallbackTelemetryAt = aircraft.observationTimes?.extendedTelemetry ?? Date.parse(aircraft.lastSeen);
  const provenance: NavigationIntegrityObservation["provenance"]["fields"] = {};
  const ages: number[] = [];
  const observedTimes: number[] = [positionAt];
  for (const [name] of integrityFields) {
    const sourceField = name === "nacP" && operational?.nacp !== null && operational?.nacp !== undefined && telemetry?.nacP === null
      ? "operationalStatus" : name;
    const fieldProvenance = field(aircraft, sourceField);
    const observedAt = fieldAt(aircraft, sourceField, fallbackTelemetryAt);
    if (!Number.isFinite(observedAt) || receivedMs - observedAt > NAVIGATION_INTEGRITY_LIMITS.maxIntegrityAgeMs) return null;
    if (Math.abs(positionAt - observedAt) > NAVIGATION_INTEGRITY_LIMITS.maxPositionIntegritySkewMs) return null;
    const ageMs = Math.max(0, receivedMs - observedAt);
    ages.push(ageMs);
    observedTimes.push(observedAt);
    provenance[name] = {
      origin: fieldProvenance?.origin ?? (aircraft.origin ?? "local"),
      provider: sourceFor(aircraft) === "LOCAL" ? "readsb" : "adsblol",
      protocol: fieldProvenance?.protocol ?? "unknown",
      observedAt: new Date(observedAt).toISOString(),
      ageMs,
    };
  }
  const observedAt = Math.max(positionAt, ...observedTimes);
  const source = sourceFor(aircraft);
  const localOrNetwork = source === "LOCAL" ? "local" : "adsblol";
  return {
    aircraftHex: aircraft.icaoHex,
    flightId: null,
    observedAt: new Date(observedAt).toISOString(),
    receivedAt: receivedAt.toISOString(),
    lat: aircraft.lat!,
    lon: aircraft.lon!,
    altitudeFt: finite(aircraft.altitude),
    altitudeBand: altitudeBand(finite(aircraft.altitude)),
    ...values,
    positionSource: aircraft.source,
    source,
    provider: localOrNetwork,
    quality: qualityFor(aircraft, integrityFields.length, ages),
    confidence: source === "LOCAL" ? "HIGH" : "MEDIUM",
    provenance: {
      origin: aircraft.origin ?? (source === "LOCAL" ? "local" : "adsblol"),
      positionObservedAt: new Date(positionAt).toISOString(),
      fields: provenance,
    },
  };
}
