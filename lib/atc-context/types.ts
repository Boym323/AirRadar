import type { AtcSector } from "@/lib/atc/types";
import type { CzAtsRouteDocument } from "@/lib/ats/cz-routes";

export type AltitudeSource = "baro" | "geom" | "none";
export type VerticalMatch = "true" | "false" | "uncertain";
export type ContextConfidence = "high" | "medium" | "low" | "partial";

export interface AtcContextInput {
  lat: number;
  lon: number;
  altitude: number | null;
  baroAltitude?: number | null;
  geomAltitude?: number | null;
  altitudeSource?: AltitudeSource;
  track: number | null;
  groundSpeed: number | null;
  verticalRate: number | null;
  timestamp: string | Date;
  onGround?: boolean;
}

export interface ContextAirspace {
  id: string;
  name: string;
  countryCode: string | null;
  airspaceType: string;
  airspaceClass: string | null;
  verticalMatch: VerticalMatch;
  horizontalMatch: "inside" | "boundary";
  confidence: ContextConfidence;
  lowerLimitFt: number | null;
  upperLimitFt: number | null;
  lowerLimitReference: string | null;
  upperLimitReference: string | null;
  publishedUnit: string | null;
  publishedFrequenciesMhz: number[];
  remarks: string | null;
  provenance: { source: string; sourceReference: string; effectiveDate: string | null; lastVerifiedAt: string | null };
}

export interface AtsRouteMatch {
  routeId: string;
  segmentId: string;
  from: string;
  to: string;
  distanceNm: number;
  alignmentDifferenceDeg: number | null;
  confidence: Exclude<ContextConfidence, "partial">;
  countryCode: string | null;
  sourceReference: string;
}

export interface ContextPoint { identifier: string; distanceNm: number; bearing: number; kind: string; }

export interface AtcContextResult {
  status: "available" | "stale" | "invalid" | "unavailable" | "degraded";
  position: { lat: number; lon: number; altitude: number | null; altitudeSource: AltitudeSource };
  supportedCountry: boolean;
  fir: ContextAirspace | null;
  currentAirspaces: ContextAirspace[];
  primaryAirspace: ContextAirspace | null;
  atsRoute: AtsRouteMatch | null;
  nearestAtsCandidate: AtsRouteMatch | null;
  nearestPoint: ContextPoint | null;
  nextPoint: ContextPoint | null;
  ahead: { airspace: ContextAirspace; distanceNm: number; estimatedMinutes: number | null; confidence: ContextConfidence } | null;
  limitation: string | null;
  computedAt: string;
  dataset: { atcVersion: string; atsVersion: string; atcCount: number; atsSegmentCount: number };
}

export interface AtcContextDataset { sectors: AtcSector[]; routeDocuments: CzAtsRouteDocument[]; }

export interface AtcContextLookupDiagnostics {
  atcBboxCandidates: number;
  atcExactPolygonTests: number;
  atsBboxCandidates: number;
  atsGeodesicCalculations: number;
  pointBboxCandidates: number;
  pointDistanceCalculations: number;
  aheadProjectedSteps: number;
  aheadAirspaceQueries: number;
}

export interface PreparedAtcContextDataset extends AtcContextDataset {
  readonly prepared: true;
  readonly airspaces: ReadonlyArray<{
    sector: AtcSector;
    boxes: ReadonlyArray<[number, number, number, number]>;
    order: number;
  }>;
  readonly segments: ReadonlyArray<{
    routeId: string;
    countryCode: string | null;
    sourceReference: string;
    segment: CzAtsRouteDocument["routes"][number]["segments"][number];
    box: [number, number, number, number];
    forwardBearing: number;
    reverseBearing: number;
  }>;
  readonly points: ReadonlyArray<{ point: CzAtsRouteDocument["routes"][number]["points"][number]; sourceReference: string; box: [number, number, number, number] }>;
  readonly atcGrid: ReadonlyMap<string, ReadonlyArray<number>>;
  readonly atsGrid: ReadonlyMap<string, ReadonlyArray<number>>;
  readonly pointGrid: ReadonlyMap<string, ReadonlyArray<number>>;
  readonly builtAt: string;
}
