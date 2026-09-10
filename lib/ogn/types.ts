export type OgnAddressType = "icao" | "flarm" | "ogn" | "fanet" | "unknown";

export type OgnTrackingSource = "flarm" | "ogn" | "fanet" | "safesky" | "pilotaware" | "ads_l";

export type OgnAircraftType =
  | "glider"
  | "tow_plane"
  | "powered_aircraft"
  | "helicopter"
  | "paraglider"
  | "hang_glider"
  | "balloon"
  | "uav"
  | "parachute"
  | "drop_plane"
  | "jet_aircraft"
  | "airship"
  | "unknown";

export interface AprsEnvelope {
  from: string;
  tocall: string;
  path: string[];
  payload: string;
}

export interface OgnId {
  address: string;
  addressType: OgnAddressType;
  addressTypeCode: number;
  aircraftType: OgnAircraftType;
  aircraftTypeCode: number;
  stealth: boolean;
  noTracking: boolean;
}

export interface OgnPosition {
  senderCallsign: string;
  tocall: string;
  path: string[];
  lastReceiver: string | null;
  id: OgnId;
  trackingSource: OgnTrackingSource;
  latitude: number;
  longitude: number;
  trackDeg: number | null;
  /** APRS CSE/SPD speed is encoded directly in knots. */
  groundSpeedKt: number | null;
  altitudeFt: number | null;
  verticalRateFpm: number | null;
  turnRateDegPerSec: number | null;
  flightLevel: number | null;
  observedAt: string;
  receivedAt: string;
  /** Diagnostic only; never used as AirRadar receiver RSSI. */
  receiverSignalDb: number | null;
}

export interface OgnTarget {
  /** Stable internal key; never serialized for anonymous targets. */
  id: string;
  /** Stable per-process opaque public key for anonymous markers. */
  publicId: string;
  address: string;
  addressType: OgnAddressType;
  senderCallsign: string;
  trackingSource: OgnTrackingSource;
  latitude: number;
  longitude: number;
  altitudeFt: number | null;
  groundSpeedKt: number | null;
  trackDeg: number | null;
  verticalRateFpm: number | null;
  turnRateDegPerSec: number | null;
  flightLevel: number | null;
  observedAt: string;
  receivedAt: string;
  aircraftType: OgnAircraftType;
  registration: string | null;
  competitionNumber: string | null;
  model: string | null;
  identityVisible: boolean;
  stealth: boolean;
  noTracking: boolean;
  lastReceiver: string | null;
  recentReceivers: string[];
  receiverCount: number;
  receiverSignalDb: number | null;
  distanceKm: number | null;
  bearing: number | null;
  stale: boolean;
}

export interface OgnTargetView extends Omit<OgnTarget, "id" | "address" | "senderCallsign" | "receiverSignalDb" | "recentReceivers" | "receiverCount"> {
  id: string;
  address: string | null;
  senderCallsign: string | null;
}

export type OgnProviderStatus = "disabled" | "connecting" | "online" | "degraded" | "reconnecting" | "offline";

export interface OgnProviderDiagnostics {
  enabled: boolean;
  status: OgnProviderStatus;
  host: string;
  port: number;
  radiusKm: number;
  connectedAt: string | null;
  lastActivityAt: string | null;
  lastPacketAt: string | null;
  lastAircraftPacketAt: string | null;
  loginAcknowledged: boolean;
  packets: number;
  positionPackets: number;
  canonicalPositionUpdates: number;
  duplicatePackets: number;
  malformed: number;
  droppedAdsb: number;
  droppedGroundStatus: number;
  droppedStatus: number;
  droppedDelayed: number;
  droppedPrivacy: number;
  droppedStale: number;
  droppedCapacity: number;
  unknownTocall: number;
  sourceCounts: Record<string, number>;
  unknownTocalls: Array<{ tocall: string; count: number }>;
  activeTargets: number;
  freshTargets: number;
  staleTargets: number;
  ddb: OgnDdbDiagnostics;
  reconnects: number;
  configurationError: string | null;
}

export interface OgnDdbDiagnostics {
  status: "disabled" | "loading" | "online" | "stale" | "offline";
  mode: "rich-json" | "base-json" | null;
  endpoint: string;
  entries: number;
  lastAttemptAt: string | null;
  lastRefreshAt: string | null;
  lastSuccessAt: string | null;
  lastHttpStatus: number | null;
  ageMs: number | null;
  failures: number;
  fallbackCount: number;
  fallbackUsed: boolean;
  aircraftTypeAvailable: boolean;
  stale: boolean;
}

export interface OgnStateSnapshot {
  enabled: boolean;
  status: OgnProviderStatus;
  fetchedAt: string;
  targets: OgnTargetView[];
}

export interface OgnPrivacyInput {
  position: OgnPosition;
  ddbAvailable: boolean;
  ddbEntry: OgnDdbEntry | null;
}

export interface OgnDdbEntry {
  deviceType: "F" | "I" | "O";
  deviceId: string;
  aircraftModel: string | null;
  registration: string | null;
  competitionNumber: string | null;
  tracked: "Y" | "N";
  identified: "Y" | "N";
  aircraftType: number | null;
}
