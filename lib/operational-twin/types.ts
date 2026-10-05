import type { OperationalTwinWindTimingShadow } from "./wind-timing-shadow";
import type { WeatherCorridorIntelligence } from "@/lib/weather/corridor-intelligence";

export const OPERATIONAL_TWIN_VERSION = "operational-digital-twin-v1" as const;
export const OPERATIONAL_TWIN_HORIZON_MINUTES = 30;
export const OPERATIONAL_TWIN_STEP_MINUTES = 2;

export type OperationalTwinProvenance = "OBSERVED" | "PUBLISHED" | "PLANNED" | "PREDICTED" | "INFERRED";
export type OperationalTwinConfidence = "HIGH" | "MEDIUM" | "LOW";
export type OperationalTwinCorridorMode = "ROUTE_AWARE" | "KINEMATIC";
export type OperationalTwinLimitationCode =
  | "BOUNDED_PROJECTION"
  | "SAMPLED_INTERSECTIONS"
  | "ATC_UNAVAILABLE"
  | "AIRSPACE_PLAN_UNAVAILABLE"
  | "SIGMET_UNAVAILABLE"
  | "PUBLIC_PREDICTION_UNAVAILABLE"
  | "WEATHER_CORRIDOR_PARTIAL"
  | "KINEMATIC_FALLBACK"
  | "OFF_ROUTE";

export type OperationalTwinEventType =
  | "WAYPOINT"
  | "ATC_SECTOR_ENTRY"
  | "PLANNED_AIRSPACE"
  | "SIGMET_INTERSECTION"
  | "ARRIVAL_ETA"
  | "RUNWAY_EXPECTATION"
  | "TRAJECTORY_STATE";

export interface OperationalTwinTrajectoryPoint {
  offsetMinutes: number;
  at: string;
  lat: number;
  lon: number;
  altitudeFt: number | null;
  trackDeg: number | null;
  uncertaintyNm: number;
  mode: OperationalTwinCorridorMode;
}

export interface OperationalTwinWaypointEstimate {
  id: string;
  name: string;
  lat: number;
  lon: number;
  offsetMinutes: number;
  at: string;
  distanceNm: number;
  sourceKind: string;
}

export interface OperationalTwinCorridor {
  horizonMinutes: number;
  stepMinutes: number;
  mode: OperationalTwinCorridorMode;
  routeAdherence: string | null;
  routePrecision: string | null;
  maxUncertaintyNm: number;
  points: OperationalTwinTrajectoryPoint[];
  waypoints: OperationalTwinWaypointEstimate[];
}

export interface OperationalTwinEvent {
  id: string;
  type: OperationalTwinEventType;
  offsetMinutes: number;
  at: string;
  title: string;
  detail: string | null;
  provenance: OperationalTwinProvenance;
  confidence: OperationalTwinConfidence;
  source: string;
  sourceReference: string | null;
  lat: number | null;
  lon: number | null;
  altitudeFt: number | null;
}

export interface OperationalTwinEvidenceSummary {
  observed: number;
  published: number;
  planned: number;
  predicted: number;
  inferred: number;
}

export interface OperationalTwinSituation {
  version: typeof OPERATIONAL_TWIN_VERSION;
  status: "available";
  generatedAt: string;
  aircraft: {
    icaoHex: string;
    callsign: string | null;
    registration: string | null;
    observedAt: string;
    stateSource: "CANONICAL" | "TRACK_FUSION";
    trackFusionReadiness: "PASS" | "WAIT" | "FAIL" | null;
  };
  corridor: OperationalTwinCorridor;
  weatherCorridor: WeatherCorridorIntelligence;
  windTimingShadow?: OperationalTwinWindTimingShadow;
  events: OperationalTwinEvent[];
  evidence: OperationalTwinEvidenceSummary;
  limitations: OperationalTwinLimitationCode[];
}


export interface OperationalTwinUnavailable {
  version: typeof OPERATIONAL_TWIN_VERSION;
  status: "unavailable" | "stale";
  generatedAt: string;
  icaoHex: string;
  reason: "invalid_aircraft" | "aircraft_not_live" | "invalid_position" | "stale_position" | "corridor_unavailable" | "internal_error";
}

export type OperationalTwinApiResponse = OperationalTwinSituation | OperationalTwinUnavailable;
