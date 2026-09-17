/**
 * Route Intelligence V2 domain contracts.
 *
 * This module contains data boundaries only. Parsers, matchers, progress
 * calculations, and UI mapping belong to their respective layers and should
 * consume these types instead of defining route-shaped local interfaces.
 */

export interface RouteCoordinate {
  lat: number;
  lon: number;
}

export type ProcedureType = "SID" | "STAR";

export type ProcedurePointKind = "FIX" | "NAVAID" | "AIRPORT" | "RUNWAY" | "UNKNOWN";

export interface ProcedurePoint {
  id: string;
  name: string;
  kind: ProcedurePointKind;
  coordinates: RouteCoordinate | null;
  sourceReference: string | null;
}

export type ProcedureLegType =
  | "DIRECT"
  | "COURSE_TO_FIX"
  | "TRACK"
  | "ARC"
  | "HOLD"
  | "DISCONTINUITY"
  | "UNKNOWN";

/** Geometry is optional because procedure publications can omit or defer it. */
export interface ProcedureGeometry {
  type: "LINE" | "ARC" | "HOLD" | "UNKNOWN";
  coordinates: RouteCoordinate[];
  center: RouteCoordinate | null;
  radiusNm: number | null;
}

export interface ProcedureLeg {
  sequence: number;
  type: ProcedureLegType;
  from: ProcedurePoint | null;
  to: ProcedurePoint | null;
  geometry: ProcedureGeometry | null;
  courseDeg: number | null;
  sourceReference: string | null;
}

export interface ProcedureDiscontinuity {
  sequence: number;
  afterLegSequence: number | null;
  beforeLegSequence: number | null;
  afterPointId: string | null;
  beforePointId: string | null;
  reason: string | null;
  sourceReference: string | null;
}

export interface ProcedureSource {
  countryCode: string | null;
  provider: string;
  reference: string;
  effectiveDate: string | null;
  airacCycle: string | null;
  amendment: string | null;
  retrievedAt: string | null;
}

export type ProcedureRunwayApplicabilityKind = "ALL" | "INCLUDE" | "EXCLUDE" | "UNKNOWN";

export interface ProcedureRunwayApplicability {
  kind: ProcedureRunwayApplicabilityKind;
  runwayDesignators: string[];
}

export interface Procedure {
  id: string;
  airportIcao: string;
  designator: string;
  type: ProcedureType;
  transition: string | null;
  runwayApplicability: ProcedureRunwayApplicability;
  legs: ProcedureLeg[];
  discontinuities: ProcedureDiscontinuity[];
  source: ProcedureSource;
  /** Published notes that do not belong to an individual leg. */
  remarks?: string | null;
}

export type RoutePhase = "DEPARTURE" | "SID" | "ENROUTE" | "EN_ROUTE" | "STAR" | "ARRIVAL" | "CONNECTOR" | "UNKNOWN";

export type RouteElementSourceKind =
  | "PUBLISHED_SID"
  | "PUBLISHED_STAR"
  | "PUBLISHED_ATS"
  | "FILED_DCT"
  | "FILED_ROUTE"
  | "SCHEMATIC";

export interface RouteElementSource {
  kind: RouteElementSourceKind;
  provider: string | null;
  countryCode: string | null;
  reference: string | null;
  procedureId: string | null;
  effectiveDate: string | null;
  airacCycle: string | null;
  amendment: string | null;
}

export interface InterpretedRoutePoint {
  id: string;
  name: string;
  coordinates: RouteCoordinate | null;
}

export interface InterpretedRouteGeometry {
  type: "LINE" | "ARC" | "SCHEMATIC" | "NONE";
  coordinates: RouteCoordinate[];
}

export type InterpretedRouteElementKind =
  | "PUBLISHED_SID"
  | "PUBLISHED_ATS"
  | "FILED_DCT"
  | "FILED_ROUTE"
  | "PUBLISHED_STAR"
  | "SCHEMATIC"
  | "UNRESOLVED_CONNECTOR";

export type InterpretedRouteElementStatus = "RESOLVED" | "UNRESOLVED" | "DISCONTINUITY";

export interface InterpretedRouteElement {
  id: string;
  sequence: number;
  kind: InterpretedRouteElementKind;
  phase: RoutePhase;
  label: string | null;
  from: InterpretedRoutePoint | null;
  to: InterpretedRoutePoint | null;
  geometry: InterpretedRouteGeometry | null;
  source: RouteElementSource;
  status: InterpretedRouteElementStatus;
  unresolvedReason: string | null;
}

export type InterpretedRouteStatus = "RESOLVED" | "PARTIAL" | "UNRESOLVED" | "NO_ROUTE";

export interface AtsRouteCoverage {
  eligibleLegs: number;
  matchedLegs: number;
  percent: number | null;
}

export interface RouteReconstructionCoverage {
  totalElements: number;
  resolvedElements: number;
  percent: number | null;
}

export interface RouteProgressCoverage {
  totalElements: number;
  completedElements: number;
  percent: number | null;
}

/** These metrics are deliberately named objects so they cannot be confused. */
export interface RouteCoverage {
  ats: AtsRouteCoverage;
  reconstruction: RouteReconstructionCoverage;
  progress: RouteProgressCoverage | null;
}

export interface InterpretedRoute {
  id: string;
  status: InterpretedRouteStatus;
  elements: InterpretedRouteElement[];
  procedureMatches: ProcedureMatch[];
  sources: RouteElementSource[];
  coverage: RouteCoverage;
}

export type ProcedureMatchStatus = "FILED" | "INFERRED_HIGH" | "INFERRED_MEDIUM" | "UNRESOLVED";
export type ProcedureRunwayCompatibility = "COMPATIBLE" | "INCOMPATIBLE" | "UNKNOWN";

export interface ProcedureMatchEvidence {
  kind: "FILED_DESIGNATOR" | "TRANSITION" | "RUNWAY" | "POSITION" | "ROUTE_SHAPE" | "SOURCE" | "OTHER";
  description: string;
  sourceReference: string | null;
}

export interface ProcedureCandidate {
  procedureId: string;
  airportIcao: string;
  designator: string;
  type: ProcedureType;
  transition: string | null;
  confidence: number | null;
  runwayCompatibility: ProcedureRunwayCompatibility;
  evidence: ProcedureMatchEvidence[];
}

export interface ProcedureMatch {
  status: ProcedureMatchStatus;
  selectedProcedureId: string | null;
  candidateCount: number;
  ambiguous: boolean;
  ambiguityReason: string | null;
  confidence: number | null;
  runwayCompatibility: ProcedureRunwayCompatibility;
  evidence: ProcedureMatchEvidence[];
  candidates: ProcedureCandidate[];
}

export type RunwayContextStatus = "REPORTED" | "INFERRED" | "UNKNOWN";

/** Reported and inferred values are independent; neither may overwrite the other. */
export interface RunwayContext {
  reportedRunway: string | null;
  inferredRunway: string | null;
  status: RunwayContextStatus;
  conflict: boolean;
}

export interface RunwayContextInput {
  reportedRunway?: string | null;
  inferredRunway?: string | null;
}

export function createRunwayContext(input: RunwayContextInput = {}): RunwayContext {
  const reportedRunway = input.reportedRunway?.trim().toUpperCase() || null;
  const inferredRunway = input.inferredRunway?.trim().toUpperCase() || null;
  return {
    reportedRunway,
    inferredRunway,
    status: reportedRunway ? "REPORTED" : inferredRunway ? "INFERRED" : "UNKNOWN",
    conflict: Boolean(reportedRunway && inferredRunway && reportedRunway !== inferredRunway),
  };
}

export function hasRunwayConflict(context: RunwayContext): boolean {
  return context.conflict;
}

export type RouteAdherence = "ON_ROUTE" | "NEAR_ROUTE" | "OFF_ROUTE" | "UNKNOWN";

/**
 * Quality of a dynamic value.  A route can be usable while its progress is
 * only estimated because one or more published elements have no geometry.
 */
export type DynamicRoutePrecision = "PRECISE" | "PARTIAL" | "ESTIMATED" | "UNAVAILABLE";

export interface DynamicRouteState {
  currentPhase: RoutePhase;
  currentElement: InterpretedRouteElement | null;
  previousPoint: InterpretedRoutePoint | null;
  nextPoint: InterpretedRoutePoint | null;
  /** Distances are nautical miles. */
  distanceToNext: number | null;
  /** Cross-track deviation is nautical miles. */
  crossTrackDeviation: number | null;
  /** Signed distance from the beginning of the current element, in nautical miles. */
  alongTrackDistance: number | null;
  routeAdherence: RouteAdherence;
  completedElements: string[];
  remainingElements: string[];
  /** Fraction from 0 to 1, or null when progress cannot be calculated. */
  routeProgress: number | null;
  /** Convenience percentage representation of routeProgress, or null. */
  routeProgressPercent: number | null;
  precision: DynamicRoutePrecision;
  progressPrecision: DynamicRoutePrecision;
}

export interface RouteIntelligenceV2Snapshot {
  route: InterpretedRoute;
  dynamic: DynamicRouteState;
  runway: RunwayContext;
}

export interface RouteElementSourceViewDTO {
  kind: RouteElementSourceKind;
  provider: string | null;
  countryCode: string | null;
  reference: string | null;
  procedureId: string | null;
  effectiveDate: string | null;
  airacCycle: string | null;
  amendment: string | null;
}

export interface RoutePointViewDTO {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
}

export interface RouteElementViewDTO {
  id: string;
  sequence: number;
  kind: InterpretedRouteElementKind;
  phase: RoutePhase;
  label: string | null;
  from: RoutePointViewDTO | null;
  to: RoutePointViewDTO | null;
  geometry: InterpretedRouteGeometry | null;
  source: RouteElementSourceViewDTO;
  status: InterpretedRouteElementStatus;
  unresolvedReason: string | null;
}

export interface ProcedureMatchViewDTO {
  status: ProcedureMatchStatus;
  selectedProcedureId: string | null;
  candidateCount: number;
  ambiguous: boolean;
  confidence: number | null;
  runwayCompatibility: ProcedureRunwayCompatibility;
}

export type RouteCoverageViewDTO = RouteCoverage;

/** Stable browser-facing shape; it intentionally contains no parser objects. */
export interface RouteIntelligenceViewDTO {
  routeId: string;
  status: InterpretedRouteStatus;
  currentPhase: RoutePhase;
  elements: RouteElementViewDTO[];
  currentElement: RouteElementViewDTO | null;
  previousPoint: RoutePointViewDTO | null;
  nextPoint: RoutePointViewDTO | null;
  distanceToNext: number | null;
  crossTrackDeviation: number | null;
  alongTrackDistance: number | null;
  routeAdherence: RouteAdherence;
  completedElementIds: string[];
  remainingElementIds: string[];
  routeProgress: number | null;
  routeProgressPercent: number | null;
  precision: DynamicRoutePrecision;
  progressPrecision: DynamicRoutePrecision;
  coverage: RouteCoverageViewDTO;
  procedureMatches: ProcedureMatchViewDTO[];
  runway: RunwayContext;
}

export type PublicRouteIntelligenceDTO = RouteIntelligenceViewDTO;
