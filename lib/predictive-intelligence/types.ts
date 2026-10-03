import type { AirportRunway } from "@/lib/airports/infrastructure";
import type { FlightPhase, FlightIntelligenceEvent } from "@/lib/intelligence/types";

export const PREDICTIVE_INTELLIGENCE_VERSION = "predictive-intelligence-v1" as const;
export type PredictionConfidence = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
export type DestinationStatus = "KNOWN" | "INFERRED" | "UNKNOWN";
export type TrajectoryState = "NORMAL" | "POSSIBLE_DEVIATION" | "DEVIATING" | "UNKNOWN";

export interface PredictionSample {
  observedAt: number;
  lat: number;
  lon: number;
  altitudeFt: number | null;
  groundSpeedKt: number | null;
  verticalRateFpm: number | null;
  trackDeg: number | null;
}

export interface PredictionAirport { icao: string; lat: number; lon: number; elevationFt?: number | null; }
export type PredictionRunway = Pick<AirportRunway, "leIdent" | "heIdent" | "leLatitude" | "leLongitude" | "leHeadingDegT" | "heLatitude" | "heLongitude" | "heHeadingDegT" | "closed">;
export interface PredictionOperations {
  runwayUsage?: ReadonlyArray<{ designator: string; arrivals: number; total: number }>;
  generatedAt?: number;
}
export interface PredictionWeather {
  observedAt: number;
  windDirectionDeg: number | null;
  windSpeedKt: number | null;
  stale?: boolean;
}

export interface PredictionFlightState {
  flightId?: number | null;
  lifecycleKey?: string | null;
  aircraft?: import("@/lib/aircraft/types").Aircraft;
  aircraftIcao: string;
  timestamp: number;
  phase: FlightPhase;
  sample: PredictionSample;
  destination: string | null;
  destinationStatus: DestinationStatus;
  distanceToDestinationNm?: number | null;
  bearingToDestinationDeg?: number | null;
}

export interface PredictiveInput {
  aircraft?: import("@/lib/aircraft/types").Aircraft;
  flightState: PredictionFlightState;
  recentSamples: readonly PredictionSample[];
  destinationAirport: PredictionAirport | null;
  runways?: readonly PredictionRunway[];
  airportOperations?: PredictionOperations | null;
  weather?: PredictionWeather | null;
  previousPrediction?: PredictiveFlightState | null;
  now: number;
}

export interface PredictionEvidence { key: string; value: string | number; }
export interface EtaPrediction { estimatedArrivalAt: number | null; confidence: PredictionConfidence; evidence: PredictionEvidence[]; }
export interface RunwayPrediction { runway: string | null; alternative: string | null; confidence: PredictionConfidence; changed: boolean; evidence: PredictionEvidence[]; }
export interface TrajectoryPrediction { state: TrajectoryState; confidence: PredictionConfidence; evidence: PredictionEvidence[]; }
export interface PredictiveFlightState {
  modelVersion: typeof PREDICTIVE_INTELLIGENCE_VERSION;
  evaluatedAt: number;
  eta: EtaPrediction;
  runway: RunwayPrediction;
  trajectory: TrajectoryPrediction;
}
export interface PredictionEvaluation { prediction: PredictiveFlightState; durationMs: number; }

export interface PredictiveEventContext { events: readonly FlightIntelligenceEvent[]; }
