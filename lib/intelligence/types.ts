import type { Aircraft } from "@/lib/aircraft/types";
import type { RunwayContext } from "@/lib/route-intelligence/contracts";

export type FlightEventType = "APPROACH" | "LANDING" | "TAKEOFF" | "GO_AROUND" | "HOLDING" | "DIVERSION" | "TOP_OF_DESCENT" | "AIRSPACE_ENTRY" | "AIRSPACE_EXIT";
export type FlightPhase = "GROUND" | "TAKEOFF" | "CLIMB" | "CRUISE" | "DESCENT" | "APPROACH" | "LANDING";
export type ConfidenceLevel = "low" | "medium" | "high";

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
}

export function confidenceLevel(value: number): ConfidenceLevel {
  return value >= 0.8 ? "high" : value >= 0.6 ? "medium" : "low";
}
