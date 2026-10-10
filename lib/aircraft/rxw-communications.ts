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
  messages: RxwCommunication[];
}
