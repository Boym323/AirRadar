import type { AirportArrivalFlowIntelligence } from "@/lib/airport-intelligence/arrival-flow-v8";
import type { AirportRunwayChangeEvidenceD2 } from "@/lib/airport-intelligence/runway-change-evidence-d2";
import type { ApproachEvidenceD3 } from "@/lib/airport-intelligence/approach-evidence-d3";

export type AirportContextSignalD4 =
  | "RUNWAY_TRANSITION_OBSERVED" | "PUBLIC_RUNWAY_DIFFERS" | "RUNWAY_STABLE"
  | "WIND_SUPPORTS_OBSERVED" | "WIND_DIFFERS" | "WIND_UNAVAILABLE"
  | "HOLDING_OR_GO_AROUND_OBSERVED" | "ARRIVAL_COMPRESSION_PREDICTED"
  | "PARTIAL_RECEIVER_HISTORY";

export interface AirportContextD4 {
  version: "airport-context-d4";
  signals: AirportContextSignalD4[];
  source: { receiver: "OBSERVED_INFERRED"; prediction: "PUBLIC_ONLY"; wind: "CURRENT_CONTEXT" | "UNAVAILABLE"; atc: "NOT_CORRELATED" };
  /** ATC sector overlap is not evidence of a clearance, active frequency or runway assignment. */
  limitation: "NO_ATC_CLEARANCE_EVIDENCE";
}

/** Explain current airport observations without fabricating ATC assignments or new forecasts. */
export function buildAirportContextD4(input: {
  runway: AirportRunwayChangeEvidenceD2;
  arrival: AirportArrivalFlowIntelligence;
  approach: ApproachEvidenceD3;
  windAvailable: boolean;
}): AirportContextD4 {
  const signals: AirportContextSignalD4[] = [];
  if (input.runway.state === "OBSERVED_TRANSITION") signals.push("RUNWAY_TRANSITION_OBSERVED");
  else if (input.runway.state === "PREDICTED_DIVERGENCE") signals.push("PUBLIC_RUNWAY_DIFFERS");
  else if (input.runway.state === "OBSERVED_STABLE") signals.push("RUNWAY_STABLE");
  if (!input.windAvailable || input.runway.windAlignment === "UNKNOWN") signals.push("WIND_UNAVAILABLE");
  else if (input.runway.windAlignment === "ALIGNED") signals.push("WIND_SUPPORTS_OBSERVED");
  else signals.push("WIND_DIFFERS");
  if (input.approach.counts.goAround > 0 || input.approach.counts.holding > 0)
    signals.push("HOLDING_OR_GO_AROUND_OBSERVED");
  if (input.arrival.compression.state === "HIGH" || input.arrival.compression.state === "ELEVATED")
    signals.push("ARRIVAL_COMPRESSION_PREDICTED");
  if (!input.approach.complete) signals.push("PARTIAL_RECEIVER_HISTORY");
  return {
    version: "airport-context-d4", signals: signals.slice(0, 7),
    source: {
      receiver: "OBSERVED_INFERRED",
      prediction: "PUBLIC_ONLY",
      wind: input.windAvailable ? "CURRENT_CONTEXT" : "UNAVAILABLE",
      atc: "NOT_CORRELATED",
    },
    limitation: "NO_ATC_CLEARANCE_EVIDENCE",
  };
}
