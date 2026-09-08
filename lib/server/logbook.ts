import "temporal-polyfill/full/global";
import type { AircraftLifetimeStats } from "@/lib/server/history";
import { dayKey, getAppTimezone } from "@/lib/server/config";

export type AircraftLogbookLabel = "new";

export interface AircraftLogbookStatus {
  labels: AircraftLogbookLabel[];
  isNew: boolean;
  firstObservedAt: string | null;
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
  lifetimeStats: Pick<AircraftLifetimeStats, "firstObservedAt">,
  now = new Date(),
  timezone = getAppTimezone(),
): AircraftLogbookStatus {
  const isNew = isNewAircraft(lifetimeStats.firstObservedAt, now, timezone);
  return {
    labels: isNew ? ["new"] : [],
    isNew,
    firstObservedAt: lifetimeStats.firstObservedAt,
  };
}
