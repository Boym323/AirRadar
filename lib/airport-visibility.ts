import type { Airport } from "@/lib/airports/types";

export type AirportVisibilityTier = "significant" | "small" | "heliport";

export interface AirportLayerVisibility {
  showAirports: boolean;
  showSignificant: boolean;
  showSmall: boolean;
  showHeliports: boolean;
}

export const DEFAULT_AIRPORT_LAYER_VISIBILITY: AirportLayerVisibility = {
  showAirports: true,
  showSignificant: true,
  showSmall: true,
  showHeliports: false,
};

export const AIRPORT_VISIBILITY_ZOOM = {
  small: 9,
  heliport: 12,
} as const;

const HELIPORT_NAME = /\b(heliport|helipad|helisurface|vrtulník|vrtulnik)\b/i;

/**
 * The public Airport DTO intentionally has no upstream airport type. IATA
 * presence is the only conservative prominence signal available to the UI;
 * everything else is treated as a small landing site unless its name clearly
 * identifies a heliport.
 */
export function airportVisibilityTier(airport: Pick<Airport, "iataCode" | "name">): AirportVisibilityTier {
  if (HELIPORT_NAME.test(airport.name)) return "heliport";
  return airport.iataCode ? "significant" : "small";
}

export function airportVisibleAtZoom(
  tier: AirportVisibilityTier,
  zoom: number,
  visibility: AirportLayerVisibility = DEFAULT_AIRPORT_LAYER_VISIBILITY,
  important = false,
): boolean {
  if (!visibility.showAirports) return false;
  if (important) return true;
  if (tier === "significant") return visibility.showSignificant;
  if (tier === "small") return visibility.showSmall && zoom >= AIRPORT_VISIBILITY_ZOOM.small;
  return visibility.showHeliports && zoom >= AIRPORT_VISIBILITY_ZOOM.heliport;
}

/**
 * MapLibre filter expression. The map owns this filter so changing a 3-second
 * aircraft snapshot does not reclassify or rebuild airport visibility.
 */
export function airportVisibilityFilter(
  zoom: number,
  visibility: AirportLayerVisibility = DEFAULT_AIRPORT_LAYER_VISIBILITY,
): unknown[] {
  if (!visibility.showAirports) return ["==", 1, 0];

  const visibleTiers: AirportVisibilityTier[] = [];
  if (visibility.showSignificant) visibleTiers.push("significant");
  if (visibility.showSmall && zoom >= AIRPORT_VISIBILITY_ZOOM.small) visibleTiers.push("small");
  if (visibility.showHeliports && zoom >= AIRPORT_VISIBILITY_ZOOM.heliport) visibleTiers.push("heliport");

  const tierFilter: unknown[] = visibleTiers.length
    ? ["match", ["get", "tier"], visibleTiers, true, false]
    : ["==", 1, 0];
  return ["all", ["any", tierFilter, ["==", ["get", "important"], true]]];
}
