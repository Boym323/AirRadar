import "temporal-polyfill/full/global";
import type { AircraftLifetimeStats } from "@/lib/server/history";
import { dayKey, getAppTimezone } from "@/lib/server/config";

export const RARE_AIRCRAFT_MAX_FLIGHTS = 3;
export const RETURNING_AIRCRAFT_GAP_DAYS = 30;

export type AircraftLogbookLabel = "new" | "rare" | "returning";

export interface AircraftLogbookStatus {
  labels: AircraftLogbookLabel[];
  isNew: boolean;
  isRare: boolean;
  isReturning: boolean;
  firstObservedAt: string | null;
  returningGapDays: number | null;
}

/**
 * NEW means that the first persisted Flight instance starts on the current
 * local receiver day. RAM state is deliberately not an input, so a process
 * restart cannot create a false NEW aircraft.
 */
export function isNewAircraft(firstObservedAt: string | null, now = new Date(), timezone = getAppTimezone()): boolean {
  if (!firstObservedAt) return false;
  const firstObserved = new Date(firstObservedAt);
  if (!Number.isFinite(firstObserved.getTime())) return false;
  return dayKey(firstObserved, timezone) === dayKey(now, timezone);
}

export function classifyAircraftLogbook(
  lifetimeStats: Pick<AircraftLifetimeStats, "firstObservedAt" | "flightCount" | "returningGapDays">,
  now = new Date(),
  timezone = getAppTimezone(),
): AircraftLogbookStatus {
  const isNew = isNewAircraft(lifetimeStats.firstObservedAt, now, timezone);
  const isRare = !isNew && lifetimeStats.flightCount > 0 && lifetimeStats.flightCount <= RARE_AIRCRAFT_MAX_FLIGHTS;
  const isReturning = lifetimeStats.returningGapDays !== null
    && lifetimeStats.returningGapDays >= RETURNING_AIRCRAFT_GAP_DAYS;
  const labels: AircraftLogbookLabel[] = [];
  if (isNew) labels.push("new");
  if (isRare) labels.push("rare");
  if (isReturning) labels.push("returning");
  return {
    labels,
    isNew,
    isRare,
    isReturning,
    firstObservedAt: lifetimeStats.firstObservedAt,
    returningGapDays: lifetimeStats.returningGapDays,
  };
}
