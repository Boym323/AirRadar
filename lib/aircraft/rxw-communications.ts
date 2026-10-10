/** A structured, unverified FPN waypoint; coordinates are explicit millidegrees only. */
export interface RxwWaypoint {
  name: string;
  lat: number | null;
  lon: number | null;
  via: string | null;
  /** Never draw an inferred segment across gaps/discontinuities. */
  breakBefore: boolean;
}

export interface RxwWaypointPlan {
  icaoHex: string;
  flight: string;
  origin: string;
  destination: string;
  status: "planned" | "inactive";
  waypoints: RxwWaypoint[];
  positionedCount: number;
  observedAt: string;
  stationId: string;
  source: "rxw-acarshub";
  confidence: "reported";
}

export interface RxwWaypointAvailability {
  icaoHex: string;
  flight: string;
  waypointCount: number;
}

/** Public, deliberately content-free metadata from an optional ACARS Hub source. */
export interface RxwReportedRoute {
  origin: string;
  destination: string;
  /** A UTC clock report, not a scheduled or confirmed arrival date. */
  etaUtc: string | null;
  flight: string | null;
}

export interface RxwRouteEvidence extends RxwReportedRoute {
  icaoHex: string;
  observedAt: string;
  stationId: string;
  source: "rxw-acarshub";
  confidence: "reported";
}

export interface RxwCommunication {
  uid: string;
  icaoHex: string;
  timestamp: string;
  protocol: string;
  stationId: string;
  frequencyMhz: number | null;
  label: string | null;
  /** Structured upstream depa/dsta/eta only; no message-body parsing. */
  reportedRoute: RxwReportedRoute | null;
}

export type RxwHubConnectionState =
  | "disabled"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error"
  | "stopped";

export interface RxwHubPublicSnapshot {
  enabled: boolean;
  source: "RXW Hub";
  connection: RxwHubConnectionState;
  lastReceivedAt: string | null;
  /** A live-flight candidate is only provided when ICAO24 and callsign match. */
  routeHint: RxwRouteEvidence | null;
  waypointPlan: RxwWaypointPlan | null;
  messages: RxwCommunication[];
}
