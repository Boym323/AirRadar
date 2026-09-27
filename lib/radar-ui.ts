import type { AircraftView } from "@/lib/aircraft/types";
import { classifyAircraftSource, type AircraftSourceClassification } from "@/lib/aircraft/source-awareness";

export interface AircraftMarkerVisualState {
  selected: boolean;
  watchlisted: boolean;
  emergency: boolean;
  stale?: boolean;
  source?: AircraftSourceClassification;
}

const STALE_POSITION_SECONDS = 60;

/** Uses the existing readsb/network position age; it does not invent a new
 * confidence signal for the public aircraft model. */
export function aircraftPositionIsStale(aircraft: Pick<AircraftView, "seenPosSeconds">): boolean {
  return aircraft.seenPosSeconds === null || aircraft.seenPosSeconds > STALE_POSITION_SECONDS;
}

export function aircraftVisualOpacity(aircraft: Pick<AircraftView, "seenPosSeconds" | "provenance">): number {
  const sourceOpacity = classifyAircraftSource(aircraft) === "NETWORK_ONLY" ? 0.78 : 1;
  return aircraftPositionIsStale(aircraft) ? sourceOpacity * 0.68 : sourceOpacity;
}

export function aircraftLabelOpacity(aircraft: Pick<AircraftView, "seenPosSeconds" | "provenance">): number {
  const sourceOpacity = classifyAircraftSource(aircraft) === "NETWORK_ONLY" ? 0.72 : 0.9;
  return aircraftPositionIsStale(aircraft) ? sourceOpacity * 0.76 : sourceOpacity;
}

export function aircraftMarkerClassNames(state: AircraftMarkerVisualState): string[] {
  return [
    "aircraft-marker",
    state.selected ? "selected" : "",
    state.watchlisted ? "watchlisted" : "",
    state.emergency ? "emergency" : "",
    state.stale ? "stale" : "",
    state.source === "NETWORK_ONLY" ? "network-only" : state.source === "OVERLAP" ? "source-overlap" : "",
  ].filter(Boolean);
}
