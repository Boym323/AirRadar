import type { Aircraft } from "@/lib/aircraft/types";
import type { RunwayContext } from "@/lib/route-intelligence/contracts";

export type FlightEventType =
  | "APPROACH"
  | "LANDING"
  | "TAKEOFF"
  | "GO_AROUND"
  | "HOLDING"
  | "HOLDING_CANDIDATE"
  | "HOLDING_ENDED"
  | "LEVEL_OFF"
  | "UNUSUAL_TURN"
  | "ORBIT"
  | "DIVERSION"
  | "TOP_OF_DESCENT"
  | "AIRSPACE_ENTRY"
  | "AIRSPACE_EXIT";

/**
 * `LANDING` remains accepted as a legacy persisted phase. New detections use
 * `FINAL` and `LANDED`, while `UNKNOWN` is used after an unusable observation.
 */
export type FlightPhase =
  | "GROUND"
  | "TAKEOFF"
  | "CLIMB"
  | "CRUISE"
  | "DESCENT"
  | "APPROACH"
  | "FINAL"
  | "GO_AROUND"
  | "LANDED"
  | "UNKNOWN"
  | "LANDING";
export type ConfidenceLevel = "low" | "medium" | "high";
export type HoldingStatus = "HOLDING_CANDIDATE" | "HOLDING_CONFIRMED" | "HOLDING_ENDED";

export interface FlightObservation {
  aircraft: Aircraft;
  observedAt: number;
}

export interface FlightIntelligenceEvent {
  id: string;
  eventKey: string;
  /** Stable semantic lifecycle key; never based on a polling minute. */
  lifecycleKey: string;
  type: FlightEventType;
  phase: FlightPhase;
  icaoHex: string;
  flightId: number | null;
  callsign: string | null;
  registration: string | null;
  occurredAt: string;
  detectedAt: string;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  airportIcao: string | null;
  runway: string | null;
  runwayContext?: RunwayContext | null;
  sectorId: string | null;
  evidence: string[];
  /** Additive lifecycle fields; old persisted rows may not contain them. */
  startedAt?: string;
  endedAt?: string;
  reasonCodes?: string[];
  metadata?: Record<string, unknown>;
}

export function confidenceLevel(value: number): ConfidenceLevel {
  return value >= 0.8 ? "high" : value >= 0.6 ? "medium" : "low";
}
