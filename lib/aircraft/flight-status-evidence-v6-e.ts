import type { FlightPlan } from "@/lib/aircraft/types";

export interface FlightStatusEvidence {
  state: "current" | "stale" | "unknown";
  retrievedAt: string | null;
  ageMinutes: number | null;
  source: "flightaware" | "none";
}

/** Evidence freshness, not flight status: never infer schedules from ADS-B.
 * FlightAware is queried on-demand elsewhere with an explicit rate/cost budget.
 */
export function assessFlightStatusEvidence(
  plan: FlightPlan | null | undefined,
  now = Date.now(),
): FlightStatusEvidence {
  if (!plan?.flightAware) return { state: "unknown", source: "none", retrievedAt: null, ageMinutes: null };
  const timestamp = plan.retrievedAt ? Date.parse(plan.retrievedAt) : Number.NaN;
  if (!Number.isFinite(timestamp) || timestamp > now + 5 * 60_000) {
    return { state: "unknown", source: "flightaware", retrievedAt: null, ageMinutes: null };
  }
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  return {
    state: minutes <= 60 ? "current" : "stale",
    source: "flightaware",
    retrievedAt: plan.retrievedAt ?? null,
    ageMinutes: minutes,
  };
}
