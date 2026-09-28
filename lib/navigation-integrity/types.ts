import type { AircraftDataOrigin, AircraftSource } from "@/lib/aircraft/types";

export type NavigationIntegrityState = "NORMAL" | "REDUCED" | "DEGRADED" | "SEVERE" | "UNKNOWN";
export type NavigationIntegrityConfidence = "LOW" | "MEDIUM" | "HIGH";
export type NavigationIntegritySource = "LOCAL" | "NETWORK";

export interface NavigationIntegrityFieldProvenance {
  origin: AircraftDataOrigin;
  provider: string | null;
  protocol: string;
  observedAt: string;
  ageMs: number;
}

export interface NavigationIntegrityObservation {
  aircraftHex: string;
  flightId: string | null;
  observedAt: string;
  receivedAt: string;
  lat: number;
  lon: number;
  altitudeFt: number | null;
  altitudeBand: number;
  nic: number | null;
  nacP: number | null;
  nacV: number | null;
  sil: number | null;
  sda: number | null;
  gva: number | null;
  adsbVersion: number | null;
  positionSource: AircraftSource;
  source: NavigationIntegritySource;
  provider: string | null;
  quality: "HIGH" | "MEDIUM" | "LOW";
  confidence: NavigationIntegrityConfidence;
  provenance: {
    origin: AircraftDataOrigin;
    positionObservedAt: string;
    fields: Partial<Record<"nic" | "nacP" | "nacV" | "sil" | "sda" | "gva" | "adsbVersion", NavigationIntegrityFieldProvenance>>;
  };
}

export interface NavigationIntegrityClassification {
  state: NavigationIntegrityState;
  indicators: string[];
  degradedFieldCount: number;
  score: number | null;
}

export interface NavigationIntegrityCellSummary {
  cellKey: string;
  latCell: number;
  lonCell: number;
  altitudeBand: number;
  sampleCount: number;
  aircraftCount: number;
  localAircraftCount: number;
  networkAircraftCount: number;
  affectedAircraftCount: number;
  state: NavigationIntegrityState;
  confidence: NavigationIntegrityConfidence;
  medianNic: number | null;
  medianNacP: number | null;
  medianNacV: number | null;
  lastObservedAt: string;
}

export interface NavigationIntegrityAnomaly {
  id: string;
  startedAt: string;
  lastObservedAt: string;
  endedAt: string | null;
  cellKeys: string[];
  altitudeBands: number[];
  affectedAircraftCount: number;
  sampleCount: number;
  baselineAircraftCount: number;
  medianNic: number | null;
  medianNacP: number | null;
  medianNacV: number | null;
  baselineMedianNic: number | null;
  baselineMedianNacP: number | null;
  baselineMedianNacV: number | null;
  confidence: NavigationIntegrityConfidence;
  severity: Exclude<NavigationIntegrityState, "NORMAL" | "UNKNOWN">;
  evidence: {
    independentAircraft: string[];
    localAircraft: number;
    networkAircraft: number;
    spatiallyAdjacent: boolean;
    durationSeconds: number;
    affectedShare: number | null;
    reasons: string[];
  };
}

export interface NavigationIntegrityDiagnostics {
  observationsCreated: number;
  persisted: number;
  deduplicated: number;
  rejectedInvalidOrStale: number;
  aircraftContributors: number;
  cellsPopulated: number;
  baselineCellsReady: number;
  anomalyCandidates: number;
  anomaliesOpened: number;
  anomaliesClosed: number;
  confidence: Record<NavigationIntegrityConfidence, number>;
  rejectionReasons: Record<string, number>;
  lastObservationAt: string | null;
  lastPersistedAt: string | null;
}

export interface NavigationIntegrityCurrentResponse {
  generatedAt: string;
  window: "5m" | "15m" | "30m" | "60m";
  summary: {
    observations: number;
    aircraft: number;
    cells: number;
    reducedAircraft: number;
    activeAnomalies: number;
  };
  cells: NavigationIntegrityCellSummary[];
  activeAnomalies: NavigationIntegrityAnomaly[];
}
