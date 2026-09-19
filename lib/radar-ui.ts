import type { AircraftSourceClassification } from "@/lib/aircraft/source-awareness";

export interface AircraftMarkerVisualState {
  selected: boolean;
  watchlisted: boolean;
  emergency: boolean;
  source?: AircraftSourceClassification;
}

export function aircraftMarkerClassNames(state: AircraftMarkerVisualState): string[] {
  return [
    "aircraft-marker",
    state.selected ? "selected" : "",
    state.watchlisted ? "watchlisted" : "",
    state.emergency ? "emergency" : "",
    state.source === "NETWORK_ONLY" ? "network-only" : state.source === "OVERLAP" ? "source-overlap" : "",
  ].filter(Boolean);
}
