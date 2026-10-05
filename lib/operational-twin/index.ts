import type {
  OperationalTwinCorridor,
  OperationalTwinEvent,
  OperationalTwinSituation,
  OperationalTwinLimitationCode,
} from "./types";
import { OPERATIONAL_TWIN_VERSION } from "./types";
import type { OperationalTwinAircraftState } from "./corridor";
import type { WeatherCorridorIntelligence } from "@/lib/weather/corridor-intelligence";

export function buildOperationalTwinSituation(input: {
  generatedAt: Date;
  aircraft: OperationalTwinAircraftState;
  corridor: OperationalTwinCorridor;
  events: OperationalTwinEvent[];
  weatherCorridor: WeatherCorridorIntelligence;
  atcAvailable: boolean;
  airspacePlanAvailable: boolean;
  sigmetAvailable: boolean;
  publicPredictionAvailable: boolean;
}): OperationalTwinSituation {
  const limitations: OperationalTwinLimitationCode[] = [
    "BOUNDED_PROJECTION",
    "SAMPLED_INTERSECTIONS",
  ];
  if (!input.atcAvailable) limitations.push("ATC_UNAVAILABLE");
  if (!input.airspacePlanAvailable) limitations.push("AIRSPACE_PLAN_UNAVAILABLE");
  if (!input.sigmetAvailable) limitations.push("SIGMET_UNAVAILABLE");
  if (!input.publicPredictionAvailable) limitations.push("PUBLIC_PREDICTION_UNAVAILABLE");
  if (input.weatherCorridor.status !== "AVAILABLE") limitations.push("WEATHER_CORRIDOR_PARTIAL");
  if (input.corridor.mode === "KINEMATIC") limitations.push("KINEMATIC_FALLBACK");
  if (input.corridor.routeAdherence === "OFF_ROUTE") limitations.push("OFF_ROUTE");

  const evidence = {
    observed: 1,
    published: input.events.filter((event) => event.provenance === "PUBLISHED").length,
    planned: input.events.filter((event) => event.provenance === "PLANNED").length,
    predicted: input.events.filter((event) => event.provenance === "PREDICTED").length,
    inferred: input.events.filter((event) => event.provenance === "INFERRED").length,
  };

  return {
    version: OPERATIONAL_TWIN_VERSION,
    status: "available",
    generatedAt: input.generatedAt.toISOString(),
    aircraft: {
      icaoHex: input.aircraft.icaoHex,
      callsign: input.aircraft.callsign,
      registration: input.aircraft.registration,
      observedAt: input.aircraft.observedAt,
      stateSource: input.aircraft.stateSource ?? "CANONICAL",
      trackFusionReadiness: input.aircraft.trackFusionReadiness ?? null,
    },
    corridor: input.corridor,
    weatherCorridor: input.weatherCorridor,
    events: input.events,
    evidence,
    limitations,
  };
}

export * from "./types";
export * from "./corridor";
export * from "./events";
export * from "./outcome";
