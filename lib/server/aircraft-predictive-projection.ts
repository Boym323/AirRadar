import type { Aircraft } from "@/lib/aircraft/types";
import type { Airport } from "@/lib/airports/types";
import type { FlightPhase } from "@/lib/intelligence/types";
import type { PredictionSample, PredictiveInput } from "@/lib/predictive-intelligence/types";
import { haversineDistanceKm } from "@/lib/geo";

/**
 * Pure predictive input projection. Keep flight-phase heuristics outside the
 * long-lived receiver coordinator; no data reads, timers or model writes.
 */
export function predictivePhase(aircraft: Aircraft, destination: Airport | null): FlightPhase {
  if (aircraft.onGround) return "GROUND";
  const destinationDistanceKm = destination && aircraft.lat !== null && aircraft.lon !== null
    ? haversineDistanceKm(aircraft.lat, aircraft.lon, destination.latitude, destination.longitude)
    : null;
  if (aircraft.targetState?.approachMode || (destinationDistanceKm !== null && destinationDistanceKm <= 35 && aircraft.verticalRate !== null && aircraft.verticalRate < -150)) return "APPROACH";
  if (aircraft.verticalRate !== null && aircraft.verticalRate > 250) return "CLIMB";
  if (aircraft.verticalRate !== null && aircraft.verticalRate < -250) return "DESCENT";
  if (aircraft.groundSpeed !== null && aircraft.groundSpeed > 120) return "CRUISE";
  return "UNKNOWN";
}

export function isAirportProximity(aircraft: Aircraft): boolean {
  if (aircraft.targetState?.approachMode) return true;
  const destination = aircraft.enrichment?.route?.destinationAirport;
  if (!destination || aircraft.lat === null || aircraft.lon === null) return false;
  return haversineDistanceKm(aircraft.lat, aircraft.lon, destination.latitude, destination.longitude) <= 15;
}

export function buildPredictiveShadowInput(aircraft: Aircraft, now: number, runways: PredictiveInput["runways"] = []): PredictiveInput | null {
  if (!Number.isFinite(now) || aircraft.lat === null || aircraft.lon === null) return null;
  const route = aircraft.enrichment?.route;
  const destination = route?.destinationAirport;
  const samples: PredictionSample[] = aircraft.trail.slice(-24).map((point) => ({ observedAt: Date.parse(point.recordedAt), lat: point.lat, lon: point.lon, altitudeFt: point.altitude, groundSpeedKt: point.groundSpeed, verticalRateFpm: null, trackDeg: point.track })).filter((point) => Number.isFinite(point.observedAt));
  samples.push({ observedAt: now, lat: aircraft.lat, lon: aircraft.lon, altitudeFt: aircraft.altitude, groundSpeedKt: aircraft.groundSpeed, verticalRateFpm: aircraft.verticalRate, trackDeg: aircraft.track });
  return {
    flightState: { aircraftIcao: aircraft.icaoHex, timestamp: now, phase: predictivePhase(aircraft, destination ?? null), sample: samples.at(-1)!, destination: route?.destination ?? null, destinationStatus: destination ? "KNOWN" : "UNKNOWN" },
    recentSamples: samples,
    destinationAirport: destination ? { icao: destination.icaoCode, lat: destination.latitude, lon: destination.longitude, elevationFt: destination.elevationFt } : null,
    runways,
    now,
  };
}

