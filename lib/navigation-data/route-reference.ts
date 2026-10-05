import type { FlightPlan } from "@/lib/aircraft/types";
import type { AviationNavPoint } from "@/lib/navigation-data/types";
import { tokenizeRoute } from "@/lib/route-intelligence";

function normalized(value: string): string {
  return value.trim().toUpperCase();
}

/**
 * Cross-references the existing Route Intelligence tokenizer with the bounded
 * AWC reference points already loaded for the radar. This is intentionally
 * display/enrichment only: it never promotes AWC data above published eAIP
 * route/procedure sources.
 */
export function routeReferencePointIds(
  plan: Pick<FlightPlan, "filedRoute" | "waypoints"> | null | undefined,
  points: readonly AviationNavPoint[],
): ReadonlySet<string> {
  if (!plan || points.length === 0) return new Set<string>();
  const knownIds = new Set(points.map((point) => normalized(point.id)));
  const routeText = plan.filedRoute?.trim() || plan.waypoints.join(" ");
  if (!routeText.trim()) return new Set<string>();

  const tokens = tokenizeRoute(routeText, { waypointNames: knownIds });
  const routeIds = new Set(tokens
    .filter((token) => token.type === "WAYPOINT")
    .map((token) => normalized(token.value))
    .filter((id) => knownIds.has(id)));

  return routeIds;
}
