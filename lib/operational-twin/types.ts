export const OPERATIONAL_TWIN_VERSION = "operational-digital-twin-v1" as const;
export const OPERATIONAL_TWIN_HORIZON_MINUTES = 30;
export const OPERATIONAL_TWIN_STEP_MINUTES = 2;

export type OperationalTwinProvenance = "OBSERVED" | "PUBLISHED" | "PLANNED" | "PREDICTED" | "INFERRED";
export type OperationalTwinConfidence = "HIGH" | "MEDIUM" | "LOW";
export type OperationalTwinCorridorMode = "ROUTE_AWARE" | "KINEMATIC";

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
  status: "available" | "unavailable" | "stale";
  generatedAt: string;
  aircraft: {
    icaoHex: string;
    callsign: string | null;
    registration: string | null;
    observedAt: string;
  };
  corridor: OperationalTwinCorridor | null;
  events: OperationalTwinEvent[];
  evidence: OperationalTwinEvidenceSummary;
  limitations: string[];
}


export interface OperationalTwinUnavailable {
  version: typeof OPERATIONAL_TWIN_VERSION;
  status: "unavailable" | "stale";
  generatedAt: string;
  icaoHex: string;
  reason: "aircraft_not_live" | "invalid_position" | "stale_position" | "corridor_unavailable" | "internal_error";
}

export type OperationalTwinApiResponse = OperationalTwinSituation | OperationalTwinUnavailable;
