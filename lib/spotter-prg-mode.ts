import type { AircraftView } from "@/lib/aircraft/types";
import type { Airport } from "@/lib/airports/types";
import type { AirportOperationsResponse } from "@/lib/server/airport-operations";
import { haversineDistanceKm, observerGeometry, type SpotterObserverPosition } from "@/lib/spotter-location";

export type SpotterPrgQueueState = "EMPTY" | "LIGHT" | "ACTIVE" | "BUSY";
export type SpotterPrgViewAngle = "GOOD" | "LOW" | "UNKNOWN";

export interface SpotterPrgInbound {
  icaoHex: string;
  label: string;
  aircraftType: string | null;
  origin: string | null;
  etaAt: string | null;
  minutesToEta: number | null;
  distanceToPrgKm: number | null;
  observerElevationDeg: number | null;
  viewAngle: SpotterPrgViewAngle;
}

export interface SpotterPrgMode {
  generatedAt: string;
  activity: AirportOperationsResponse["activity"];
  likelyRunway: string | null;
  runwayConfidence: string | null;
  inboundCount: number;
  queueState: SpotterPrgQueueState;
  nextEtaAt: string | null;
  nextArrivals: SpotterPrgInbound[];
}

function destinationIsPrg(aircraft: AircraftView): boolean {
  const route = aircraft.enrichment?.route;
  const values = [route?.destination, route?.destinationAirport?.iataCode, route?.destinationAirport?.icaoCode]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim().toUpperCase());
  return values.includes("PRG") || values.includes("LKPR");
}

function etaForAircraft(aircraft: AircraftView, nowMs: number): { etaAt: string | null; minutes: number | null } {
  const raw = aircraft.enrichment?.flightPlan?.estimatedArrival
    ?? aircraft.enrichment?.flightPlan?.scheduledArrival
    ?? null;
  if (!raw) return { etaAt: null, minutes: null };
  const etaMs = Date.parse(raw);
  if (!Number.isFinite(etaMs)) return { etaAt: null, minutes: null };
  const minutes = (etaMs - nowMs) / 60_000;
  return {
    etaAt: new Date(etaMs).toISOString(),
    minutes: Number.isFinite(minutes) ? minutes : null,
  };
}

function queueState(count: number): SpotterPrgQueueState {
  if (count === 0) return "EMPTY";
  if (count <= 2) return "LIGHT";
  if (count <= 4) return "ACTIVE";
  return "BUSY";
}

export function buildPrgSpottingMode(
  aircraft: readonly AircraftView[],
  airport: Pick<Airport, "latitude" | "longitude">,
  operations: AirportOperationsResponse,
  observer: SpotterObserverPosition | null,
  now = new Date(),
  limit = 6,
): SpotterPrgMode {
  const nowMs = now.getTime();
  const inbound = aircraft
    .filter((item) => !item.onGround && destinationIsPrg(item))
    .map((item) => {
      const eta = etaForAircraft(item, nowMs);
      const distanceToPrgKm = item.lat === null || item.lon === null
        ? null
        : haversineDistanceKm(
            { lat: item.lat, lon: item.lon },
            { lat: airport.latitude, lon: airport.longitude },
          );
      const geometry = observer ? observerGeometry(item, observer) : null;
      const observerElevationDeg = geometry?.elevationDeg ?? null;
      const viewAngle: SpotterPrgViewAngle = observerElevationDeg === null
        ? "UNKNOWN"
        : observerElevationDeg >= 10
          ? "GOOD"
          : "LOW";
      return {
        icaoHex: item.icaoHex,
        label: item.callsign ?? item.registration ?? item.icaoHex,
        aircraftType: item.aircraftType ?? item.enrichment?.metadata?.icaoTypeCode ?? null,
        origin: item.enrichment?.route?.origin ?? null,
        etaAt: eta.etaAt,
        minutesToEta: eta.minutes,
        distanceToPrgKm,
        observerElevationDeg,
        viewAngle,
      } satisfies SpotterPrgInbound;
    })
    .filter((item) => item.minutesToEta === null || item.minutesToEta >= -10)
    .sort((a, b) => {
      const aEta = a.minutesToEta !== null && a.minutesToEta >= 0 ? a.minutesToEta : Number.POSITIVE_INFINITY;
      const bEta = b.minutesToEta !== null && b.minutesToEta >= 0 ? b.minutesToEta : Number.POSITIVE_INFINITY;
      if (aEta !== bEta) return aEta - bEta;
      const aDistance = a.distanceToPrgKm ?? Number.POSITIVE_INFINITY;
      const bDistance = b.distanceToPrgKm ?? Number.POSITIVE_INFINITY;
      return aDistance - bDistance || a.icaoHex.localeCompare(b.icaoHex);
    });

  return {
    generatedAt: operations.generatedAt,
    activity: operations.activity,
    likelyRunway: operations.likelyRunway?.designator ?? null,
    runwayConfidence: operations.likelyRunway?.confidence ?? null,
    inboundCount: inbound.length,
    queueState: queueState(inbound.length),
    nextEtaAt: inbound.find((item) => item.etaAt && (item.minutesToEta ?? -1) >= 0)?.etaAt ?? null,
    nextArrivals: inbound.slice(0, Math.max(1, Math.min(10, limit))),
  };
}
