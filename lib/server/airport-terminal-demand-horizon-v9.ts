import type { AircraftView } from "@/lib/aircraft/types";
import type { Airport } from "@/lib/airports/types";
import { haversineDistanceKm, initialBearing } from "@/lib/geo";
import { getAircraftStateService } from "@/lib/server/aircraft-state";

export const AIRPORT_TERMINAL_DEMAND_HORIZON_V9_VERSION =
  "airport-live-board-v9" as const;

export type AirportTerminalTrackRelation = "TOWARD" | "CROSSING" | "AWAY" | "UNKNOWN";

export interface AirportTerminalDemandHorizonItem {
  icaoHex: string;
  label: string;
  distanceKm: number;
  etaMinutes: number | null;
  altitudeFt: number | null;
  groundSpeedKt: number | null;
  trackRelation: AirportTerminalTrackRelation;
  routeDestination: string;
  estimateBasis: "DIRECT_DISTANCE_GROUNDSPEED";
}

export interface AirportTerminalDemandHorizonV9 {
  version: typeof AIRPORT_TERMINAL_DEMAND_HORIZON_V9_VERSION;
  generatedAt: string;
  airport: string;
  coverage: {
    localAircraft: number;
    routeMatchedInbound: number;
    etaEstimated: number;
  };
  demand: {
    within30Minutes: number;
    within60Minutes: number;
    beyond60Minutes: number;
    unknownEta: number;
  };
  items: AirportTerminalDemandHorizonItem[];
  truncated: boolean;
  limitations: Array<
    | "LOCAL_RECEIVER_ONLY"
    | "ROUTE_DESTINATION_REQUIRED"
    | "DIRECT_DISTANCE_GROUNDSPEED_ETA"
    | "NOT_PUBLIC_PREDICTION"
    | "NOT_ATC_SEQUENCE"
    | "NO_CAPACITY_OR_DELAY_INFERENCE"
  >;
}

const MAX_ITEMS = 12;
const MAX_ETA_MINUTES = 120;
const FRESH_POSITION_SECONDS = 60;
const FRESH_OBSERVATION_MS = 120_000;
const MAX_FUTURE_CLOCK_SKEW_MS = 5_000;

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalize(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase() ?? "";
  return normalized || null;
}

function destinationIdentifiers(airport: Airport): Set<string> {
  return new Set([
    normalize(airport.icaoCode),
    normalize(airport.iataCode),
  ].filter((value): value is string => Boolean(value)));
}

function angleDifference(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

function trackRelation(
  aircraft: AircraftView,
  airport: Airport,
): AirportTerminalTrackRelation {
  if (!finite(aircraft.lat) || !finite(aircraft.lon) || !finite(aircraft.track)
    || aircraft.track < 0 || aircraft.track > 360) return "UNKNOWN";
  const bearing = initialBearing(aircraft.lat, aircraft.lon, airport.latitude, airport.longitude);
  const difference = angleDifference(aircraft.track, bearing);
  if (difference <= 70) return "TOWARD";
  if (difference >= 120) return "AWAY";
  return "CROSSING";
}

function routeDestination(aircraft: AircraftView, identifiers: ReadonlySet<string>): string | null {
  const destination = normalize(aircraft.enrichment?.route?.destination);
  return destination && identifiers.has(destination) ? destination : null;
}

export function buildAirportTerminalDemandHorizonV9(input: {
  airport: Airport;
  liveAircraft: readonly AircraftView[];
  now?: Date;
}): AirportTerminalDemandHorizonV9 {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const identifiers = destinationIdentifiers(input.airport);

  const candidates = input.liveAircraft.flatMap((aircraft): AirportTerminalDemandHorizonItem[] => {
    const destination = routeDestination(aircraft, identifiers);
    if (!destination || aircraft.onGround || !finite(aircraft.lat) || !finite(aircraft.lon)
      || Math.abs(aircraft.lat) > 90 || Math.abs(aircraft.lon) > 180) return [];
    // Missing, negative, or future-looking age must not certify fresh position evidence.
    if (!finite(aircraft.seenPosSeconds) || aircraft.seenPosSeconds < 0
      || aircraft.seenPosSeconds > FRESH_POSITION_SECONDS) return [];
    const lastSeenMs = Date.parse(aircraft.lastSeen);
    if (!Number.isFinite(lastSeenMs) || lastSeenMs > nowMs + MAX_FUTURE_CLOCK_SKEW_MS
      || nowMs - lastSeenMs > FRESH_OBSERVATION_MS) return [];

    const distanceKm = haversineDistanceKm(
      aircraft.lat,
      aircraft.lon,
      input.airport.latitude,
      input.airport.longitude,
    );
    if (!Number.isFinite(distanceKm)) return [];
    const groundSpeedKt = finite(aircraft.groundSpeed) && aircraft.groundSpeed >= 60
      ? aircraft.groundSpeed
      : null;
    const relation = trackRelation(aircraft, input.airport);
    const distanceNm = distanceKm / 1.852;
    // Groundspeed and direct distance do not imply an inbound ETA while
    // crossing, moving away, or lacking trustworthy track evidence.
    const rawEta = groundSpeedKt === null || relation !== "TOWARD"
      ? null
      : distanceNm / groundSpeedKt * 60;
    const etaMinutes = rawEta !== null && rawEta <= MAX_ETA_MINUTES
      ? Number(rawEta.toFixed(1))
      : null;

    return [{
      icaoHex: aircraft.icaoHex,
      label: aircraft.callsign?.trim() || aircraft.registration?.trim() || aircraft.icaoHex,
      distanceKm: Number(distanceKm.toFixed(1)),
      etaMinutes,
      altitudeFt: aircraft.baroAltitude ?? aircraft.altitude ?? aircraft.geomAltitude ?? null,
      groundSpeedKt,
      trackRelation: relation,
      routeDestination: destination,
      estimateBasis: "DIRECT_DISTANCE_GROUNDSPEED",
    }];
  }).sort((left, right) =>
    (left.etaMinutes ?? Number.POSITIVE_INFINITY) - (right.etaMinutes ?? Number.POSITIVE_INFINITY)
    || left.distanceKm - right.distanceKm
    || left.icaoHex.localeCompare(right.icaoHex)
  );

  const withEta = candidates.filter((item) => item.etaMinutes !== null);
  return {
    version: AIRPORT_TERMINAL_DEMAND_HORIZON_V9_VERSION,
    generatedAt: now.toISOString(),
    airport: input.airport.icaoCode.trim().toUpperCase(),
    coverage: {
      localAircraft: input.liveAircraft.length,
      routeMatchedInbound: candidates.length,
      etaEstimated: withEta.length,
    },
    demand: {
      within30Minutes: withEta.filter((item) => item.etaMinutes! <= 30).length,
      within60Minutes: withEta.filter((item) => item.etaMinutes! <= 60).length,
      beyond60Minutes: withEta.filter((item) => item.etaMinutes! > 60).length,
      unknownEta: candidates.filter((item) => item.etaMinutes === null).length,
    },
    items: candidates.slice(0, MAX_ITEMS),
    truncated: candidates.length > MAX_ITEMS,
    limitations: [
      "LOCAL_RECEIVER_ONLY",
      "ROUTE_DESTINATION_REQUIRED",
      "DIRECT_DISTANCE_GROUNDSPEED_ETA",
      "NOT_PUBLIC_PREDICTION",
      "NOT_ATC_SEQUENCE",
      "NO_CAPACITY_OR_DELAY_INFERENCE",
    ],
  };
}

export function getAirportTerminalDemandHorizonV9(
  airport: Airport,
  now = new Date(),
): AirportTerminalDemandHorizonV9 {
  const snapshot = getAircraftStateService().getSnapshot({
    coverage: "local",
    includeTrails: false,
  });
  return buildAirportTerminalDemandHorizonV9({
    airport,
    liveAircraft: snapshot.aircraft,
    now,
  });
}
