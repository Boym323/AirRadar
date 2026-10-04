import type { AirportRunway } from "@/lib/airports/infrastructure";
import { calculateRunwayWind } from "@/lib/airport-runway-wind";
import type { AirportMovement, AirportMovementsResponse, MovementConfidence } from "@/lib/server/airport-movements";

export type AirportActivity = "QUIET" | "LIGHT" | "MODERATE" | "BUSY";

export interface AirportOperationsWind {
  directionDeg: number;
  speedKt: number;
  runway: string;
  headwindKt: number;
  crosswindKt: number;
}

export interface AirportOperationsResponse {
  airport: AirportMovementsResponse["airport"];
  generatedAt: string;
  window: AirportMovementsResponse["period"];
  provenance: "OBSERVED" | "INFERRED";
  complete: boolean;
  truncated: boolean;
  activity: AirportActivity;
  likelyRunway: { designator: string; confidence: MovementConfidence; sampleCount: number } | null;
  arrivals: AirportMovement[];
  departures: AirportMovement[];
  approaches: AirportMovement[];
  recentMovements: AirportMovement[];
  runwayUsage: Array<{ designator: string; arrivals: number; departures: number; total: number }>;
  wind: AirportOperationsWind[];
  goArounds: AirportMovement[];
  holding: AirportMovement[];
  diagnostics: AirportMovementsResponse["diagnostics"];
}

function activity(count: number): AirportActivity {
  if (count === 0) return "QUIET";
  if (count <= 3) return "LIGHT";
  if (count <= 8) return "MODERATE";
  return "BUSY";
}

function runwayDirections(runways: readonly AirportRunway[]): Array<{ ident: string; heading: number }> {
  return runways.flatMap((runway) => [
    runway.leIdent && Number.isFinite(runway.leHeadingDegT) ? { ident: runway.leIdent, heading: runway.leHeadingDegT as number } : null,
    runway.heIdent && Number.isFinite(runway.heHeadingDegT) ? { ident: runway.heIdent, heading: runway.heHeadingDegT as number } : null,
  ]).filter((value): value is { ident: string; heading: number } => value !== null);
}

export function buildAirportOperations(
  movements: AirportMovementsResponse,
  runways: readonly AirportRunway[] = [],
  metar: { windDirectionDeg: number | null; windSpeedKt: number | null; windCalm?: boolean; windVariable?: boolean } | null = null,
): AirportOperationsResponse {
  const arrivals = movements.movements.filter((item) => item.movement === "APPROACH" || item.movement === "LANDING");
  const departures = movements.movements.filter((item) => item.movement === "TAKEOFF" || item.movement === "DEPARTURE");
  const approaches = movements.movements.filter((item) => item.movement === "APPROACH");
  const runwayUsage = new Map<string, { arrivals: number; departures: number }>();
  for (const item of movements.movements) {
    if (!item.runway || item.movement === "OVERFLIGHT" || item.movement === "HOLDING") continue;
    const current = runwayUsage.get(item.runway.designator) ?? { arrivals: 0, departures: 0 };
    if (item.movement === "APPROACH" || item.movement === "LANDING" || item.movement === "GO_AROUND") current.arrivals += 1;
    if (item.movement === "TAKEOFF" || item.movement === "DEPARTURE") current.departures += 1;
    runwayUsage.set(item.runway.designator, current);
  }
  const usage = [...runwayUsage.entries()].map(([designator, values]) => ({ ...values, designator, total: values.arrivals + values.departures }))
    .sort((a, b) => b.total - a.total || a.designator.localeCompare(b.designator, undefined, { numeric: true }));
  const top = usage[0];
  const likelyRunway = top ? { designator: top.designator, sampleCount: top.total, confidence: top.total >= 5 ? "high" as const : top.total >= 2 ? "medium" as const : "low" as const } : null;
  const wind = metar && !metar.windCalm && !metar.windVariable && metar.windDirectionDeg !== null && metar.windSpeedKt !== null
    ? runwayDirections(runways).flatMap((direction) => {
      const component = calculateRunwayWind(direction.heading, metar.windDirectionDeg, metar.windSpeedKt);
      return component ? [{ directionDeg: component.windDirectionDeg, speedKt: component.windSpeedKt, runway: direction.ident, headwindKt: component.headwindKt, crosswindKt: component.crosswindKt }] : [];
    }) : [];
  return {
    airport: movements.airport, generatedAt: movements.generatedAt, window: movements.period,
    provenance: "INFERRED", complete: movements.complete, truncated: movements.truncated,
    activity: activity(movements.movements.filter((item) => item.movement !== "OVERFLIGHT").length), likelyRunway,
    arrivals, departures, approaches, recentMovements: movements.movements.slice(0, 20), runwayUsage: usage,
    wind, goArounds: movements.movements.filter((item) => item.movement === "GO_AROUND"),
    holding: movements.movements.filter((item) => item.movement === "HOLDING"), diagnostics: movements.diagnostics,
  };
}
