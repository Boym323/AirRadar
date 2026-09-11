import type { AtcSector } from "@/lib/atc/types";
import type { AirspaceActivityResponse, PlannedAirspaceWindow, PlannedAirspaceWindowSource } from "./types";

export type AirspacePlanMapState = "planned-now" | "upcoming";

export interface AirspacePlanMapMatch {
  canonicalDesignator: string;
  state: AirspacePlanMapState;
  stale: boolean;
  sequence: number;
  source: PlannedAirspaceWindowSource;
  sourceReference: string;
  startsAt: string;
  endsAt: string;
  lowerLimit: string;
  upperLimit: string;
  responsibleUnit: string | null;
  activity: string | null;
}

function normalizedTimestamp(value: string): number | null {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function canonicalAirspaceDesignator(value: string | null | undefined): string | null {
  if (!value) return null;
  const compact = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const match = compact.match(/(?:LK)?(TRA|TSA)(\d+[A-Z]?)/);
  return match ? `LK${match[1]}${match[2]}` : null;
}

function matchFromWindow(
  window: PlannedAirspaceWindow,
  state: AirspacePlanMapState,
  stale: boolean,
): AirspacePlanMapMatch | null {
  const canonicalDesignator = canonicalAirspaceDesignator(window.canonicalDesignator || window.designator);
  if (!canonicalDesignator) return null;
  return {
    canonicalDesignator,
    state,
    stale,
    sequence: window.sequence,
    source: window.source,
    sourceReference: window.sourceReference,
    startsAt: window.startsAt,
    endsAt: window.endsAt,
    lowerLimit: window.lowerLimit,
    upperLimit: window.upperLimit,
    responsibleUnit: window.responsibleUnit,
    activity: window.activity,
  };
}

function shouldReplace(current: AirspacePlanMapMatch | undefined, candidate: AirspacePlanMapMatch): boolean {
  if (!current) return true;
  if (candidate.state !== current.state) return candidate.state === "planned-now";
  if (candidate.state === "planned-now") return candidate.sequence > current.sequence;

  const candidateStart = normalizedTimestamp(candidate.startsAt) ?? Number.POSITIVE_INFINITY;
  const currentStart = normalizedTimestamp(current.startsAt) ?? Number.POSITIVE_INFINITY;
  if (candidateStart !== currentStart) return candidateStart < currentStart;
  return candidate.sequence > current.sequence;
}

export function buildAirspacePlanMapIndex(
  response: AirspaceActivityResponse | null | undefined,
  now: Date = new Date(),
): ReadonlyMap<string, AirspacePlanMapMatch> {
  const result = new Map<string, AirspacePlanMapMatch>();
  if (!response || response.planned.status === "unavailable") return result;

  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) return result;
  const stale = response.planned.status === "stale";

  for (const window of response.planned.windows) {
    const startsAt = normalizedTimestamp(window.startsAt);
    const endsAt = normalizedTimestamp(window.endsAt);
    if (startsAt === null || endsAt === null || endsAt <= nowMs) continue;

    const state: AirspacePlanMapState = startsAt <= nowMs ? "planned-now" : "upcoming";
    const candidate = matchFromWindow(window, state, stale);
    if (!candidate) continue;
    const existing = result.get(candidate.canonicalDesignator);
    if (shouldReplace(existing, candidate)) result.set(candidate.canonicalDesignator, candidate);
  }

  return result;
}

export function matchAirspacePlanForSector(
  sector: Pick<AtcSector, "id" | "name">,
  index: ReadonlyMap<string, AirspacePlanMapMatch>,
): AirspacePlanMapMatch | null {
  for (const candidate of [sector.id, sector.name]) {
    const canonical = canonicalAirspaceDesignator(candidate);
    if (!canonical) continue;
    const match = index.get(canonical);
    if (match) return match;
  }
  return null;
}
