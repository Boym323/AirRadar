import type { AircraftView } from "@/lib/aircraft/types";
import { destinationPoint, haversineDistanceKm } from "@/lib/geo";

export const REGIONAL_SITUATION_VERSION = "regional-situation-v1";
export const REGIONAL_SITUATION_MAX_AIRCRAFT = 80;
export const REGIONAL_SITUATION_MAX_EDGES = 160;
export const REGIONAL_SITUATION_HORIZONS_MINUTES = [5, 15, 30] as const;
const REGIONAL_SITUATION_SAMPLE_STEP_MINUTES = 1;

const MAX_OBSERVATION_AGE_MS = 90_000;
const MIN_GROUND_SPEED_KT = 60;
const MAX_CONTEXT_HORIZONTAL_NM = 20;
const MAX_CONTEXT_VERTICAL_FT = 8_000;
const ELEVATED_HORIZONTAL_NM = 10;
const ELEVATED_VERTICAL_FT = 4_000;

export type RegionalSituationReason = "PROJECTED_COPRESENCE" | "SHARED_DESTINATION";
export type RegionalSituationSignificance = "CONTEXT" | "ELEVATED";

export interface RegionalSituationNode {
  icaoHex: string;
  label: string;
  callsign: string | null;
  registration: string | null;
  observedAt: string;
  destination: string | null;
  lat: number;
  lon: number;
  altitudeFt: number | null;
  groundSpeedKt: number;
  trackDeg: number;
}

export interface RegionalSituationEdge {
  id: string;
  source: string;
  target: string;
  reasons: RegionalSituationReason[];
  significance: RegionalSituationSignificance;
  sharedDestination: string | null;
  closestProjectedDistanceNm: number | null;
  closestProjectedVerticalFt: number | null;
  closestProjectedOffsetMinutes: number | null;
}

export interface RegionalSituationGraph {
  version: typeof REGIONAL_SITUATION_VERSION;
  generatedAt: string;
  horizonMinutes: 30;
  nodeLimit: number;
  edgeLimit: number;
  truncatedNodes: boolean;
  truncatedEdges: boolean;
  nodes: RegionalSituationNode[];
  edges: RegionalSituationEdge[];
  limitations: Array<
    "BOUNDED_LIVE_SNAPSHOT"
    | "KINEMATIC_PROJECTION_ONLY"
    | "NOT_SEPARATION_PRODUCT"
    | "NO_ATC_CLEARANCE_INFERENCE"
  >;
}

interface ProjectedSample {
  offsetMinutes: number;
  lat: number;
  lon: number;
  altitudeFt: number | null;
}

interface Candidate {
  node: RegionalSituationNode;
  samples: ProjectedSample[];
  sortDistanceKm: number;
}

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function projectedAltitude(aircraft: AircraftView, offsetMinutes: number): number | null {
  const altitude = aircraft.baroAltitude ?? aircraft.altitude ?? aircraft.geomAltitude;
  if (!finite(altitude)) return null;
  const verticalRate = aircraft.verticalRate ?? aircraft.baroRate ?? aircraft.geomRate;
  if (!finite(verticalRate)) return altitude;
  const appliedMinutes = Math.min(offsetMinutes, 10);
  return Math.max(0, Math.min(60_000, altitude + verticalRate * appliedMinutes));
}

function candidateFromAircraft(aircraft: AircraftView, nowMs: number): Candidate | null {
  if (
    aircraft.onGround
    || !finite(aircraft.lat)
    || !finite(aircraft.lon)
    || !finite(aircraft.groundSpeed)
    || aircraft.groundSpeed < MIN_GROUND_SPEED_KT
    || !finite(aircraft.track)
  ) return null;

  const observedAtMs = Date.parse(aircraft.lastSeen);
  if (!Number.isFinite(observedAtMs) || Math.abs(nowMs - observedAtMs) > MAX_OBSERVATION_AGE_MS) return null;

  const samples = Array.from({ length: 30 / REGIONAL_SITUATION_SAMPLE_STEP_MINUTES + 1 }, (_, index) => index * REGIONAL_SITUATION_SAMPLE_STEP_MINUTES).map((offsetMinutes) => {
    const distanceKm = aircraft.groundSpeed! * 1.852 * (offsetMinutes / 60);
    const [lon, lat] = destinationPoint(aircraft.lat!, aircraft.lon!, distanceKm, aircraft.track!);
    return {
      offsetMinutes,
      lat,
      lon,
      altitudeFt: projectedAltitude(aircraft, offsetMinutes),
    };
  });

  const node: RegionalSituationNode = {
    icaoHex: aircraft.icaoHex,
    label: aircraft.callsign ?? aircraft.registration ?? aircraft.icaoHex,
    callsign: aircraft.callsign ?? null,
    registration: aircraft.registration ?? null,
    observedAt: aircraft.lastSeen,
    destination: aircraft.enrichment?.route?.destination ?? null,
    lat: aircraft.lat,
    lon: aircraft.lon,
    altitudeFt: aircraft.baroAltitude ?? aircraft.altitude ?? aircraft.geomAltitude ?? null,
    groundSpeedKt: aircraft.groundSpeed,
    trackDeg: aircraft.track,
  };

  return {
    node,
    samples,
    sortDistanceKm: finite(aircraft.distanceKm) ? aircraft.distanceKm : Number.POSITIVE_INFINITY,
  };
}

function relationForPair(a: Candidate, b: Candidate): RegionalSituationEdge | null {
  const reasons: RegionalSituationReason[] = [];
  const sharedDestination = a.node.destination
    && b.node.destination
    && a.node.destination === b.node.destination
    ? a.node.destination
    : null;
  if (sharedDestination) reasons.push("SHARED_DESTINATION");

  let closestProjectedDistanceNm: number | null = null;
  let closestProjectedVerticalFt: number | null = null;
  let closestProjectedOffsetMinutes: number | null = null;
  let elevated = false;

  for (let index = 0; index < a.samples.length; index += 1) {
    const first = a.samples[index]!;
    const second = b.samples[index]!;
    const horizontalNm = haversineDistanceKm(first.lat, first.lon, second.lat, second.lon) / 1.852;
    const verticalFt = finite(first.altitudeFt) && finite(second.altitudeFt)
      ? Math.abs(first.altitudeFt - second.altitudeFt)
      : null;

    const verticalCompatible = verticalFt === null || verticalFt <= MAX_CONTEXT_VERTICAL_FT;
    if (horizontalNm <= MAX_CONTEXT_HORIZONTAL_NM && verticalCompatible) {
      if (!reasons.includes("PROJECTED_COPRESENCE")) reasons.push("PROJECTED_COPRESENCE");
      if (closestProjectedDistanceNm === null || horizontalNm < closestProjectedDistanceNm) {
        closestProjectedDistanceNm = horizontalNm;
        closestProjectedVerticalFt = verticalFt;
        closestProjectedOffsetMinutes = first.offsetMinutes;
      }
      if (horizontalNm <= ELEVATED_HORIZONTAL_NM && (verticalFt === null || verticalFt <= ELEVATED_VERTICAL_FT)) {
        elevated = true;
      }
    }
  }

  if (reasons.length === 0) return null;
  const [source, target] = [a.node.icaoHex, b.node.icaoHex].sort();
  return {
    id: `${source}:${target}`,
    source,
    target,
    reasons,
    significance: elevated ? "ELEVATED" : "CONTEXT",
    sharedDestination,
    closestProjectedDistanceNm,
    closestProjectedVerticalFt,
    closestProjectedOffsetMinutes,
  };
}

export function buildRegionalSituationGraph(
  aircraft: readonly AircraftView[],
  now = new Date(),
): RegionalSituationGraph {
  const candidates = aircraft
    .map((item) => candidateFromAircraft(item, now.getTime()))
    .filter((item): item is Candidate => item !== null)
    .sort((a, b) => a.sortDistanceKm - b.sortDistanceKm || a.node.icaoHex.localeCompare(b.node.icaoHex));

  const selected = candidates.slice(0, REGIONAL_SITUATION_MAX_AIRCRAFT);
  const edges: RegionalSituationEdge[] = [];
  let truncatedEdges = false;

  outer:
  for (let first = 0; first < selected.length; first += 1) {
    for (let second = first + 1; second < selected.length; second += 1) {
      const edge = relationForPair(selected[first]!, selected[second]!);
      if (!edge) continue;
      if (edges.length >= REGIONAL_SITUATION_MAX_EDGES) {
        truncatedEdges = true;
        break outer;
      }
      edges.push(edge);
    }
  }

  edges.sort((a, b) =>
    (a.significance === b.significance ? 0 : a.significance === "ELEVATED" ? -1 : 1)
    || (a.closestProjectedDistanceNm ?? Number.POSITIVE_INFINITY) - (b.closestProjectedDistanceNm ?? Number.POSITIVE_INFINITY)
    || a.id.localeCompare(b.id)
  );

  return {
    version: REGIONAL_SITUATION_VERSION,
    generatedAt: now.toISOString(),
    horizonMinutes: 30,
    nodeLimit: REGIONAL_SITUATION_MAX_AIRCRAFT,
    edgeLimit: REGIONAL_SITUATION_MAX_EDGES,
    truncatedNodes: candidates.length > selected.length,
    truncatedEdges,
    nodes: selected.map((item) => item.node),
    edges,
    limitations: [
      "BOUNDED_LIVE_SNAPSHOT",
      "KINEMATIC_PROJECTION_ONLY",
      "NOT_SEPARATION_PRODUCT",
      "NO_ATC_CLEARANCE_INFERENCE",
    ],
  };
}
