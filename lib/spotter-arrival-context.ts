import type { AircraftView } from "@/lib/aircraft/types";
import { verticalTrend, type SpotterSkyStory } from "@/lib/spotter-story";

export interface SpotterPrgArrivalContext {
  destination: "PRG";
  estimatedArrival: string | null;
  runway: string | null;
  terminal: string | null;
  gate: string | null;
  progressPercent: number | null;
  approachMode: boolean | null;
  verticalTrend: ReturnType<typeof verticalTrend>;
  source: "flight-plan" | "route";
}

function destinationIsPrague(aircraft: AircraftView): boolean {
  const route = aircraft.enrichment?.route;
  const codes = [
    route?.destination,
    route?.destinationAirport?.iataCode,
    route?.destinationAirport?.icaoCode,
  ]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim().toUpperCase());
  return codes.includes("PRG") || codes.includes("LKPR");
}

function finitePercent(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(100, Math.max(0, value))
    : null;
}

export function buildPrgArrivalContext(
  aircraft: AircraftView,
  story?: SpotterSkyStory | null,
): SpotterPrgArrivalContext | null {
  if (!destinationIsPrague(aircraft)) return null;

  const flightPlan = aircraft.enrichment?.flightPlan;
  const flightAware = flightPlan?.flightAware;
  const operational = flightAware?.operational;

  return {
    destination: "PRG",
    estimatedArrival: story?.estimatedArrival
      ?? flightPlan?.estimatedArrival
      ?? flightPlan?.scheduledArrival
      ?? null,
    runway: operational?.arrivalRunway?.trim() || null,
    terminal: operational?.destinationTerminal?.trim() || null,
    gate: operational?.destinationGate?.trim() || null,
    progressPercent: finitePercent(flightAware?.progressPercent),
    approachMode: aircraft.targetState?.approachMode ?? null,
    verticalTrend: verticalTrend(aircraft.verticalRate),
    source: flightPlan ? "flight-plan" : "route",
  };
}
