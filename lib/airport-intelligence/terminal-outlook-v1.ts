import type { AirportArrivalFlowIntelligence } from "./arrival-flow-v8";
import type { AirportFlowPressureSummary, AirportRunwayFlowIntelligence } from "./v3";

export const AIRPORT_TERMINAL_OUTLOOK_VERSION = "airport-terminal-outlook-v1" as const;

export interface AirportTerminalOutlook {
  version: typeof AIRPORT_TERMINAL_OUTLOOK_VERSION;
  generatedAt: string | null;
  status: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
  arrivalDemand: {
    within5Minutes: number;
    within15Minutes: number;
    within30Minutes: number;
    trend: AirportArrivalFlowIntelligence["demand"]["trend"];
  };
  pressure: AirportArrivalFlowIntelligence["pressure"];
  queue: AirportArrivalFlowIntelligence["queue"];
  compression: AirportArrivalFlowIntelligence["compression"];
  runway: {
    observed: string | null;
    predicted: string | null;
    alignment: AirportArrivalFlowIntelligence["runwayAlignment"]["state"];
    flowState: AirportRunwayFlowIntelligence["state"];
  };
  recentExceptions: {
    holding: number;
    goAround: number;
  };
  limitations: Array<
    "OPERATIONAL_CONTEXT_ONLY"
    | "NOT_ATC_CONFIGURATION"
    | "RECEIVER_AND_PUBLIC_PREDICTION_EVIDENCE"
    | "NO_CAUSAL_INFERENCE"
  >;
}

export function buildAirportTerminalOutlook(input: {
  arrivalFlow: AirportArrivalFlowIntelligence;
  flowPressure: AirportFlowPressureSummary;
  runwayFlow: AirportRunwayFlowIntelligence;
}): AirportTerminalOutlook {
  const generatedAt = input.arrivalFlow.referenceTime;
  const status = generatedAt === null
    ? "UNAVAILABLE"
    : input.arrivalFlow.evidence === "RECEIVER_ONLY"
      ? "PARTIAL"
      : "AVAILABLE";

  return {
    version: AIRPORT_TERMINAL_OUTLOOK_VERSION,
    generatedAt,
    status,
    arrivalDemand: {
      within5Minutes: input.arrivalFlow.demand.within5Minutes,
      within15Minutes: input.arrivalFlow.demand.within15Minutes,
      within30Minutes: input.arrivalFlow.demand.within30Minutes,
      trend: input.arrivalFlow.demand.trend,
    },
    pressure: { ...input.arrivalFlow.pressure },
    queue: { ...input.arrivalFlow.queue, reasons: [...input.arrivalFlow.queue.reasons] },
    compression: { ...input.arrivalFlow.compression },
    runway: {
      observed: input.arrivalFlow.runwayAlignment.observedRunway,
      predicted: input.arrivalFlow.runwayAlignment.predictedRunway,
      alignment: input.arrivalFlow.runwayAlignment.state,
      flowState: input.runwayFlow.state,
    },
    recentExceptions: {
      holding: input.flowPressure.holdingRecent,
      goAround: input.flowPressure.goAroundRecent,
    },
    limitations: [
      "OPERATIONAL_CONTEXT_ONLY",
      "NOT_ATC_CONFIGURATION",
      "RECEIVER_AND_PUBLIC_PREDICTION_EVIDENCE",
      "NO_CAUSAL_INFERENCE",
    ],
  };
}
