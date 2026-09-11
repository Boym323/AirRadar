import type { Aircraft } from "@/lib/aircraft/types";
import { getOnDemandEnrichmentService } from "@/lib/server/providers";

/**
 * Adds the optional paid FlightAware plan only for explicit aircraft-detail
 * requests. The provider remains fail-soft and the returned object is a copy,
 * so live RAM state is never mutated by a detail page/API request.
 */
export async function enrichAircraftDetailView(
  liveAircraft: Aircraft | null,
  observedAt = new Date(),
): Promise<Aircraft | null> {
  if (!liveAircraft) return null;
  try {
    const flightPlan = await getOnDemandEnrichmentService().getFlightPlanOnDemand(liveAircraft, observedAt);
    if (!flightPlan) return liveAircraft;
    return {
      ...liveAircraft,
      enrichment: {
        ...(liveAircraft.enrichment ?? {}),
        flightPlan,
      },
    };
  } catch {
    return liveAircraft;
  }
}
