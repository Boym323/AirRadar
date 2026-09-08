export interface AircraftMarkerVisualState {
  selected: boolean;
  watchlisted: boolean;
  emergency: boolean;
}

export function aircraftMarkerClassNames(state: AircraftMarkerVisualState): string[] {
  return [
    "aircraft-marker",
    state.selected ? "selected" : "",
    state.watchlisted ? "watchlisted" : "",
    state.emergency ? "emergency" : "",
  ].filter(Boolean);
}
