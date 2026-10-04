import type { AirportRunway } from "@/lib/airports/infrastructure";
import { calculateRunwayWind } from "@/lib/airport-runway-wind";
import type { AirportMovement } from "@/lib/server/airport-movements";
import type { AirportOperationsResponse } from "@/lib/server/airport-operations";
import type { MetarObservation } from "@/lib/weather/types";

export type AirportRunwayWindAlignment = "aligned" | "different" | "unknown";

export interface AirportRunwayIntelligence {
  inferredRunway: string | null;
  inferredShare: number | null;
  inferredCount: number;
  inferredTotal: number;
  confidence: "low" | "medium" | "high" | null;
  windFavoredRunway: string | null;
  windHeadwindKt: number | null;
  windCrosswindKt: number | null;
  alignment: AirportRunwayWindAlignment;
}

export interface AirportOperationsTimelineItem {
  key: string;
  movement: AirportMovement;
}

const TIMELINE_LIMIT = 12;

function runwayDirections(runways: readonly AirportRunway[]): Array<{ ident: string; headingDeg: number }> {
  return runways
    .filter((runway) => runway.closed !== true)
    .flatMap((runway) => [
      runway.leIdent && Number.isFinite(runway.leHeadingDegT)
        ? { ident: runway.leIdent.trim().toUpperCase(), headingDeg: runway.leHeadingDegT as number }
        : null,
      runway.heIdent && Number.isFinite(runway.heHeadingDegT)
        ? { ident: runway.heIdent.trim().toUpperCase(), headingDeg: runway.heHeadingDegT as number }
        : null,
    ])
    .filter((value): value is { ident: string; headingDeg: number } => Boolean(value?.ident));
}

function windFavoredRunway(
  runways: readonly AirportRunway[],
  metar: MetarObservation | null,
): { ident: string; headwindKt: number; crosswindKt: number } | null {
  if (!metar || metar.windCalm || metar.windVariable || metar.windDirectionDeg === null || metar.windSpeedKt === null) return null;
  const candidates = runwayDirections(runways).flatMap((runway) => {
    const component = calculateRunwayWind(runway.headingDeg, metar.windDirectionDeg, metar.windSpeedKt);
    return component ? [{
      ident: runway.ident,
      headwindKt: component.headwindKt,
      crosswindKt: component.crosswindKt,
    }] : [];
  });
  return candidates.sort((left, right) =>
    right.headwindKt - left.headwindKt
    || left.crosswindKt - right.crosswindKt
    || left.ident.localeCompare(right.ident, undefined, { numeric: true }))[0] ?? null;
}

export function buildAirportRunwayIntelligence(
  operations: AirportOperationsResponse | null,
  runways: readonly AirportRunway[],
  metar: MetarObservation | null,
): AirportRunwayIntelligence {
  const usage = operations?.runwayUsage ?? [];
  const total = usage.reduce((sum, item) => sum + Math.max(0, item.total), 0);
  const top = usage[0] ?? null;
  const inferredRunway = operations?.likelyRunway?.designator?.trim().toUpperCase()
    || top?.designator?.trim().toUpperCase()
    || null;
  const inferredCount = inferredRunway
    ? usage.find((item) => item.designator.trim().toUpperCase() === inferredRunway)?.total
      ?? operations?.likelyRunway?.sampleCount
      ?? 0
    : 0;
  const favored = windFavoredRunway(runways, metar);
  const alignment: AirportRunwayWindAlignment = inferredRunway && favored
    ? inferredRunway === favored.ident ? "aligned" : "different"
    : "unknown";

  return {
    inferredRunway,
    inferredShare: total > 0 && inferredCount > 0 ? inferredCount / total : null,
    inferredCount,
    inferredTotal: total,
    confidence: operations?.likelyRunway?.confidence ?? null,
    windFavoredRunway: favored?.ident ?? null,
    windHeadwindKt: favored?.headwindKt ?? null,
    windCrosswindKt: favored?.crosswindKt ?? null,
    alignment,
  };
}

export function buildAirportOperationsTimeline(
  operations: AirportOperationsResponse | null,
  limit = TIMELINE_LIMIT,
): AirportOperationsTimelineItem[] {
  if (!operations) return [];
  const seen = new Set<string>();
  return operations.recentMovements
    .filter((movement) => {
      if (!Number.isFinite(Date.parse(movement.observedAt))) return false;
      const key = `${movement.flightId}:${movement.movement}:${movement.observedAt}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) =>
      Date.parse(right.observedAt) - Date.parse(left.observedAt)
      || right.flightId - left.flightId)
    .slice(0, Math.max(1, limit))
    .map((movement) => ({
      key: `${movement.flightId}:${movement.movement}:${movement.observedAt}`,
      movement,
    }));
}
