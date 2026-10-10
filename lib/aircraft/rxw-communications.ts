/** Public, deliberately content-free metadata from an optional ACARS Hub source. */
export interface RxwCommunication {
  uid: string;
  icaoHex: string;
  timestamp: string;
  protocol: string;
  stationId: string;
  frequencyMhz: number | null;
  label: string | null;
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
  messages: RxwCommunication[];
}
