import { altitudeBand, cellKey } from "@/lib/navigation-integrity/grid";
import type {
  NavigationIntegrityAnomaly,
  NavigationIntegrityAuditCategory,
  NavigationIntegrityConfidence,
  NavigationIntegrityCurrentResponse,
  NavigationIntegrityState,
} from "@/lib/navigation-integrity/types";
import type { OperationalTwinCorridor, OperationalTwinTrajectoryPoint } from "./types";

export const NAVIGATION_INTEGRITY_CORRIDOR_VERSION = "navigation-integrity-corridor-v1" as const;
export const NAVIGATION_INTEGRITY_CORRIDOR_WINDOW = "15m" as const;

export type NavigationIntegrityCorridorStatus = "AVAILABLE" | "INSUFFICIENT";
export type NavigationIntegrityCorridorSeverity = Exclude<NavigationIntegrityState, "NORMAL" | "UNKNOWN">;

export interface NavigationIntegrityCorridorEvent {
  id: string;
  anomalyId: string;
  entryOffsetMinutes: number;
  exitOffsetMinutes: number;
  entryAt: string;
  exitAt: string;
  lat: number;
  lon: number;
  altitudeFt: number | null;
  altitudeBand: number;
  cellKey: string;
  sampledPoints: number;
  severity: NavigationIntegrityCorridorSeverity;
  confidence: NavigationIntegrityConfidence;
  affectedAircraftCount: number;
  localAircraftCount: number;
  networkAircraftCount: number;
  baselineMaturity: string;
  auditCategories: NavigationIntegrityAuditCategory[];
  source: "AIRRADAR_NAVIGATION_INTEGRITY";
  provenance: "INFERRED";
}

export interface NavigationIntegrityCorridorIntelligence {
  version: typeof NAVIGATION_INTEGRITY_CORRIDOR_VERSION;
  status: NavigationIntegrityCorridorStatus;
  generatedAt: string;
  sourceGeneratedAt: string;
  sourceWindow: typeof NAVIGATION_INTEGRITY_CORRIDOR_WINDOW;
  activeAnomalies: number;
  intersections: number;
  events: NavigationIntegrityCorridorEvent[];
  limitations: Array<"SAMPLED_CENTERLINE" | "REGIONAL_HEURISTIC" | "CAUSE_UNKNOWN">;
}

function anomalyMatchesPoint(
  anomaly: NavigationIntegrityAnomaly,
  point: OperationalTwinTrajectoryPoint,
): { key: string; band: number } | null {
  const band = altitudeBand(point.altitudeFt);
  if (band < 0 || !anomaly.altitudeBands.includes(band)) return null;
  const key = cellKey(point.lat, point.lon, band);
  return anomaly.cellKeys.includes(key) ? { key, band } : null;
}

function eventForAnomaly(
  anomaly: NavigationIntegrityAnomaly,
  points: readonly OperationalTwinTrajectoryPoint[],
): NavigationIntegrityCorridorEvent | null {
  const matches = points.flatMap((point) => {
    const matched = anomalyMatchesPoint(anomaly, point);
    return matched ? [{ point, ...matched }] : [];
  });
  if (!matches.length) return null;

  const entry = matches[0]!;
  const exit = matches.at(-1)!;
  return {
    id: `navigation-integrity:${anomaly.id}:${entry.point.offsetMinutes}`,
    anomalyId: anomaly.id,
    entryOffsetMinutes: entry.point.offsetMinutes,
    exitOffsetMinutes: exit.point.offsetMinutes,
    entryAt: entry.point.at,
    exitAt: exit.point.at,
    lat: entry.point.lat,
    lon: entry.point.lon,
    altitudeFt: entry.point.altitudeFt,
    altitudeBand: entry.band,
    cellKey: entry.key,
    sampledPoints: matches.length,
    severity: anomaly.severity,
    confidence: anomaly.confidence,
    affectedAircraftCount: anomaly.affectedAircraftCount,
    localAircraftCount: anomaly.evidence.structured.source.localAircraft,
    networkAircraftCount: anomaly.evidence.structured.source.networkAircraft,
    baselineMaturity: anomaly.evidence.structured.baseline.maturity,
    auditCategories: [...anomaly.evidence.structured.auditCategories],
    source: "AIRRADAR_NAVIGATION_INTEGRITY",
    provenance: "INFERRED",
  };
}

export function buildNavigationIntegrityCorridorIntelligence({
  corridor,
  current,
  generatedAt = new Date(),
}: {
  corridor: OperationalTwinCorridor;
  current: NavigationIntegrityCurrentResponse;
  generatedAt?: Date;
}): NavigationIntegrityCorridorIntelligence {
  const sourceHasEvidence = current.summary.observations > 0
    || current.summary.aircraft > 0
    || current.cells.length > 0
    || current.activeAnomalies.length > 0;

  const events = current.activeAnomalies
    .map((anomaly) => eventForAnomaly(anomaly, corridor.points))
    .filter((event): event is NavigationIntegrityCorridorEvent => event !== null)
    .sort((left, right) => left.entryOffsetMinutes - right.entryOffsetMinutes
      || left.anomalyId.localeCompare(right.anomalyId));

  return {
    version: NAVIGATION_INTEGRITY_CORRIDOR_VERSION,
    status: sourceHasEvidence ? "AVAILABLE" : "INSUFFICIENT",
    generatedAt: generatedAt.toISOString(),
    sourceGeneratedAt: current.generatedAt,
    sourceWindow: NAVIGATION_INTEGRITY_CORRIDOR_WINDOW,
    activeAnomalies: current.activeAnomalies.length,
    intersections: events.length,
    events,
    limitations: ["SAMPLED_CENTERLINE", "REGIONAL_HEURISTIC", "CAUSE_UNKNOWN"],
  };
}
