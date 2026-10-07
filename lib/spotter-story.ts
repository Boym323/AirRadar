import type { AircraftView } from "@/lib/aircraft/types";
import type { SpotterClosestApproach } from "@/lib/spotter-location";
import type { SpotterInterestScore } from "@/lib/spotter-interest";

export interface SpotterSkyStory {
  identity: string;
  registration: string | null;
  aircraftType: string | null;
  aircraftDescription: string | null;
  operator: string | null;
  manufacturer: string | null;
  year: string | null;
  origin: string | null;
  destination: string | null;
  originName: string | null;
  destinationName: string | null;
  estimatedArrival: string | null;
  altitudeFt: number | null;
  groundSpeedKt: number | null;
  verticalRateFpm: number | null;
  closestApproachKm: number | null;
  secondsUntilClosest: number | null;
  elevationAtClosestDeg: number | null;
  phase: SpotterClosestApproach["phase"] | null;
  interest: SpotterInterestScore;
}

function airportName(value: AircraftView["enrichment"] extends infer E
  ? E extends { route?: infer R }
    ? R extends { originAirport?: infer A }
      ? A
      : never
    : never
  : never): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const municipality = typeof record.municipality === "string" ? record.municipality.trim() : "";
  return name || municipality || null;
}

export function buildSpotterSkyStory(
  aircraft: AircraftView,
  interest: SpotterInterestScore,
  closestApproach: SpotterClosestApproach | null,
): SpotterSkyStory {
  const metadata = aircraft.enrichment?.metadata;
  const route = aircraft.enrichment?.route;
  const flightPlan = aircraft.enrichment?.flightPlan;
  const type = metadata?.icaoTypeCode
    ?? aircraft.aircraftType
    ?? metadata?.aircraftType
    ?? aircraft.aircraftDescription
    ?? null;

  return {
    identity: aircraft.callsign ?? aircraft.registration ?? aircraft.icaoHex,
    registration: aircraft.registration ?? metadata?.registration ?? null,
    aircraftType: type,
    aircraftDescription: aircraft.aircraftDescription ?? metadata?.aircraftDescription ?? null,
    operator: route?.airline ?? metadata?.operator ?? flightPlan?.flightAware?.operator ?? null,
    manufacturer: metadata?.manufacturer ?? null,
    year: metadata?.year ?? null,
    origin: route?.origin ?? null,
    destination: route?.destination ?? null,
    originName: airportName(route?.originAirport),
    destinationName: airportName(route?.destinationAirport),
    estimatedArrival: flightPlan?.estimatedArrival ?? flightPlan?.scheduledArrival ?? null,
    altitudeFt: aircraft.altitude,
    groundSpeedKt: aircraft.groundSpeed,
    verticalRateFpm: aircraft.verticalRate,
    closestApproachKm: closestApproach?.closestHorizontalDistanceKm ?? null,
    secondsUntilClosest: closestApproach?.secondsUntilClosest ?? null,
    elevationAtClosestDeg: closestApproach?.elevationAtClosestDeg ?? null,
    phase: closestApproach?.phase ?? null,
    interest,
  };
}

export function verticalTrend(rateFpm: number | null): "climbing" | "descending" | "level" | "unknown" {
  if (rateFpm === null || !Number.isFinite(rateFpm)) return "unknown";
  if (rateFpm > 250) return "climbing";
  if (rateFpm < -250) return "descending";
  return "level";
}
