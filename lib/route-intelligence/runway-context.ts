import type { FlightPlan } from "@/lib/aircraft/types";
import type { AirportRunway } from "@/lib/airports/infrastructure";
import { haversineDistanceKm } from "@/lib/geo";
import {
  createRunwayContext,
  normalizeRunwayDesignator,
  type ProcedureRunwayApplicability,
  type ProcedureRunwayCompatibility,
  type RunwayContext,
  type RunwayContextConfidence,
} from "./contracts";

export interface RunwayInferencePosition {
  lat: number;
  lon: number;
  track: number | null;
}

export interface RunwayInferenceAirport {
  latitude: number;
  longitude: number;
}

export interface RunwayContextResolverInput {
  /** A provider runway is treated as reported evidence, never as ATC proof. */
  reportedRunway?: string | null;
  /** FlightAware's actual runway is the supported provider runway source. */
  flightPlan?: Pick<FlightPlan, "source" | "flightAware"> | null;
  positions?: readonly RunwayInferencePosition[];
  airport?: RunwayInferenceAirport | null;
  runways?: readonly AirportRunway[];
  inferredConfidence?: RunwayContextConfidence;
}

type RunwayDirection = "DEPARTURE" | "ARRIVAL";

interface RunwayEnd {
  designator: string;
  lat: number;
  lon: number;
  heading: number | null;
}

interface GeometryCandidate {
  end: RunwayEnd;
  score: number;
  thresholdDistance: number;
}

const THRESHOLD_RADIUS_KM = 8;
const MIN_RUNWAY_SCORE = 4;
const MIN_SCORE_MARGIN = 1.2;

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function angularDifference(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

function runwayEnds(runway: AirportRunway): RunwayEnd[] {
  return [
    runway.leIdent && finite(runway.leLatitude) && finite(runway.leLongitude)
      ? { designator: runway.leIdent, lat: runway.leLatitude, lon: runway.leLongitude, heading: runway.leHeadingDegT }
      : null,
    runway.heIdent && finite(runway.heLatitude) && finite(runway.heLongitude)
      ? { designator: runway.heIdent, lat: runway.heLatitude, lon: runway.heLongitude, heading: runway.heHeadingDegT }
      : null,
  ].filter((value): value is RunwayEnd => value !== null);
}

function validPosition(position: RunwayInferencePosition): boolean {
  return finite(position.lat) && position.lat >= -90 && position.lat <= 90
    && finite(position.lon) && position.lon >= -180 && position.lon <= 180;
}

function providerRunway(direction: RunwayDirection, flightPlan: RunwayContextResolverInput["flightPlan"]): string | null {
  const value = direction === "DEPARTURE"
    ? flightPlan?.flightAware?.operational?.departureRunway
    : flightPlan?.flightAware?.operational?.arrivalRunway;
  return normalizeRunwayDesignator(value);
}

function geometryRunway(
  direction: RunwayDirection,
  positions: readonly RunwayInferencePosition[],
  runways: readonly AirportRunway[],
): string | null {
  const validPositions = positions.filter(validPosition);
  if (!validPositions.length) return null;
  const trackPosition = direction === "DEPARTURE" ? validPositions[0] : validPositions.at(-1);
  const candidates: GeometryCandidate[] = runways
    .filter((runway) => runway.closed !== true)
    .flatMap(runwayEnds)
    .map((end) => {
      const thresholdDistance = Math.min(...validPositions.map((position) => haversineDistanceKm(position.lat, position.lon, end.lat, end.lon)));
      const headingScore = finite(trackPosition?.track) && finite(end.heading)
        ? Math.max(0, 30 - angularDifference(trackPosition.track, end.heading)) / 3
        : 0;
      const thresholdScore = Math.max(0, THRESHOLD_RADIUS_KM - thresholdDistance);
      return { end, score: headingScore + thresholdScore, thresholdDistance };
    })
    .sort((a, b) => b.score - a.score || a.end.designator.localeCompare(b.end.designator, undefined, { numeric: true }));
  const best = candidates[0];
  if (!best || best.score < MIN_RUNWAY_SCORE || best.thresholdDistance > THRESHOLD_RADIUS_KM) return null;
  const second = candidates[1];
  if (second && best.score - second.score < MIN_SCORE_MARGIN) return null;
  return normalizeRunwayDesignator(best.end.designator);
}

/** The one geometry inference used by movement and route runway resolution. */
export function inferRunwayFromGeometry(
  direction: RunwayDirection,
  positions: readonly RunwayInferencePosition[] = [],
  runways: readonly AirportRunway[] = [],
): string | null {
  return geometryRunway(direction, positions, runways);
}

function resolveRunwayContext(direction: RunwayDirection, input: RunwayContextResolverInput = {}): RunwayContext {
  const reportedRunway = normalizeRunwayDesignator(input.reportedRunway) ?? providerRunway(direction, input.flightPlan);
  const inferredRunway = geometryRunway(direction, input.positions ?? [], input.runways ?? []);
  const hasReported = Boolean(reportedRunway);
  const hasInferred = Boolean(inferredRunway);
  const conflict = Boolean(hasReported && hasInferred && reportedRunway !== inferredRunway);
  const source = hasReported && hasInferred ? "MULTIPLE" : hasReported ? "FLIGHTAWARE" : hasInferred ? "AIRPORT_GEOMETRY" : "UNKNOWN";
  const confidence = conflict ? null : hasReported ? "HIGH" : hasInferred ? (input.inferredConfidence ?? "LOW") : null;
  return createRunwayContext({ reportedRunway, inferredRunway, source, confidence });
}

export function resolveDepartureRunwayContext(input: RunwayContextResolverInput = {}): RunwayContext {
  return resolveRunwayContext("DEPARTURE", input);
}

export function resolveArrivalRunwayContext(input: RunwayContextResolverInput = {}): RunwayContext {
  return resolveRunwayContext("ARRIVAL", input);
}

function contextRunways(context: RunwayContext): string[] {
  return [...new Set([context.reportedRunway, context.inferredRunway]
    .map(normalizeRunwayDesignator)
    .filter((value): value is string => value !== null))];
}

/** Compare published applicability to all retained runway evidence. */
export function compareProcedureRunwayApplicability(
  applicability: ProcedureRunwayApplicability | null | undefined,
  context: RunwayContext | null | undefined,
): ProcedureRunwayCompatibility {
  if (!applicability || applicability.kind === "UNKNOWN") return "UNKNOWN";
  if (applicability.kind === "ALL") return "COMPATIBLE";
  const runwayDesignators = new Set(applicability.runwayDesignators.map(normalizeRunwayDesignator).filter((value): value is string => value !== null));
  const values = context ? contextRunways(context) : [];
  if (!runwayDesignators.size || !values.length) return "UNKNOWN";
  const matches = values.map((value) => runwayDesignators.has(value));
  if (applicability.kind === "INCLUDE") {
    if (matches.every(Boolean)) return "COMPATIBLE";
    if (matches.every((value) => !value)) return "INCOMPATIBLE";
    return "UNKNOWN";
  }
  if (matches.every((value) => !value)) return "COMPATIBLE";
  if (matches.every(Boolean)) return "INCOMPATIBLE";
  return "UNKNOWN";
}
