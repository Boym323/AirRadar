/** View IDs are stable deep-link and browser-gate contracts. */
export const AIRPORT_V5_VIEWS = ["overview", "arrivals", "departures", "operations", "weather", "map", "analytics"] as const;
export type AirportV5View = (typeof AIRPORT_V5_VIEWS)[number];
export type AirportOperationsView = Extract<AirportV5View, "overview" | "arrivals" | "departures" | "operations" | "analytics">;
