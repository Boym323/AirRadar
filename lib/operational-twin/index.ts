import type {
  OperationalTwinCorridor,
  OperationalTwinEvent,
  OperationalTwinSituation,
} from "./types";
import { OPERATIONAL_TWIN_VERSION } from "./types";
import type { OperationalTwinAircraftState } from "./corridor";

export function buildOperationalTwinSituation(input: {
  generatedAt: Date;
  aircraft: OperationalTwinAircraftState;
  corridor: OperationalTwinCorridor;
  events: OperationalTwinEvent[];
  atcAvailable: boolean;
  airspacePlanAvailable: boolean;
  sigmetAvailable: boolean;
  publicPredictionAvailable: boolean;
}): OperationalTwinSituation {
  const limitations: string[] = [
    "The corridor is a bounded 30-minute situational projection, not a cleared or certified flight trajectory.",
    "Future crossings are sampled estimates and can occur between displayed corridor points.",
  ];
  if (!input.atcAvailable) limitations.push("ATC/ATS context is unavailable, so sector and published-route context can be incomplete.");
  if (!input.airspacePlanAvailable) limitations.push("AUP/UUP plan context is unavailable. Planned airspace allocation is never treated as confirmed real-time activation.");
  if (!input.sigmetAvailable) limitations.push("SIGMET context is unavailable.");
  if (!input.publicPredictionAvailable) limitations.push("Readiness-gated PUBLIC ETA/runway/trajectory advisories are unavailable.");
  if (input.corridor?.mode === "KINEMATIC") limitations.push("No usable route geometry is available; horizontal projection follows current track and groundspeed.");
  if (input.corridor?.routeAdherence === "OFF_ROUTE") limitations.push("Route Intelligence reports OFF_ROUTE; route geometry is not used for the corridor.");

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
    },
    corridor: input.corridor,
    events: input.events,
    evidence,
    limitations,
  };
}

export * from "./types";
export * from "./corridor";
export * from "./events";
