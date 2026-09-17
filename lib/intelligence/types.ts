import type { Aircraft } from "@/lib/aircraft/types";

export type FlightEventType = "APPROACH" | "LANDING" | "TAKEOFF" | "GO_AROUND" | "HOLDING" | "AIRSPACE_ENTRY" | "AIRSPACE_EXIT";
export type ConfidenceLevel = "low" | "medium" | "high";

export interface FlightObservation {
  aircraft: Aircraft;
  observedAt: number;
}

export interface FlightIntelligenceEvent {
  id: string;
  eventKey: string;
  type: FlightEventType;
  icaoHex: string;
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
  sectorId: string | null;
  evidence: string[];
}

export function confidenceLevel(value: number): ConfidenceLevel {
  return value >= 0.8 ? "high" : value >= 0.6 ? "medium" : "low";
}
