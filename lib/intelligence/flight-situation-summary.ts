import type { AircraftView } from "@/lib/aircraft/types";
import type { AtcContextResult } from "@/lib/atc-context/types";
import type { AircraftSigmetContext } from "@/lib/weather/aircraft-sigmet-context";
import type { AircraftWindAheadProfile, AircraftWindContext } from "@/lib/weather/aircraft-wind-context";
import type { RouteWeatherContext } from "@/lib/weather/route-weather-context";
import type { SigmetTrajectoryDeviation } from "@/lib/weather/sigmet-trajectory-deviation";

export type SituationObservedPhase = "ground" | "climb" | "descent" | "level" | "unknown";
export type SituationWeatherState = "current_sigmet" | "route_sigmet" | "projected_sigmet" | "clear" | "unknown";
export type SituationWindKind = "headwind" | "tailwind" | "calm" | "unknown";

export interface FlightSituationSummary {
  phase: SituationObservedPhase;
  currentSector: string | null;
  currentUnit: string | null;
  nextSector: string | null;
  nextSectorMinutes: number | null;
  nextSectorConfidence: "high" | "medium" | "low" | null;
  weatherState: SituationWeatherState;
  weatherHazard: string | null;
  weatherDistanceNm: number | null;
  weatherStale: boolean;
  windKind: SituationWindKind;
  windKt: number | null;
  windTrend: AircraftWindAheadProfile["trend"] | null;
  windTrendDeltaKt: number | null;
  routeDeviationNearSigmet: boolean;
}

function observedPhase(aircraft: AircraftView): SituationObservedPhase {
  if (aircraft.onGround) return "ground";
  const rate = aircraft.verticalRate ?? aircraft.baroRate ?? aircraft.geomRate;
  if (rate === null || !Number.isFinite(rate)) return "unknown";
  if (rate > 100) return "climb";
  if (rate < -100) return "descent";
  return "level";
}

export function buildFlightSituationSummary(input: {
  aircraft: AircraftView;
  atc: AtcContextResult | null;
  sigmets: AircraftSigmetContext[];
  sigmetStale?: boolean;
  routeWeather: RouteWeatherContext | null;
  sigmetDeviation: SigmetTrajectoryDeviation | null;
  wind: AircraftWindContext | null;
  windAhead: AircraftWindAheadProfile | null;
}): FlightSituationSummary {
  const currentSigmet = input.sigmetStale ? null : input.sigmets.find((item) => item.relation === "current") ?? null;
  const projectedSigmet = input.sigmetStale ? null : input.sigmets.find((item) => item.relation === "projected") ?? null;
  const routeSigmet = input.routeWeather?.stale ? null : input.routeWeather?.matches[0] ?? null;

  let weatherState: SituationWeatherState = "unknown";
  let weatherHazard: string | null = null;
  let weatherDistanceNm: number | null = null;
  if (currentSigmet) {
    weatherState = "current_sigmet";
    weatherHazard = currentSigmet.hazard ?? currentSigmet.phenomenon;
    weatherDistanceNm = 0;
  } else if (routeSigmet) {
    weatherState = "route_sigmet";
    weatherHazard = routeSigmet.hazard;
    weatherDistanceNm = routeSigmet.distanceAlongRouteNm;
  } else if (projectedSigmet) {
    weatherState = "projected_sigmet";
    weatherHazard = projectedSigmet.hazard ?? projectedSigmet.phenomenon;
    weatherDistanceNm = projectedSigmet.distanceNm;
  } else if (input.routeWeather?.status === "available" && !input.routeWeather.stale) {
    weatherState = "clear";
  }

  let windKind: SituationWindKind = "unknown";
  let windKt: number | null = null;
  if (input.wind) {
    if (input.wind.headwindKt >= 1 && input.wind.headwindKt >= input.wind.tailwindKt) {
      windKind = "headwind";
      windKt = input.wind.headwindKt;
    } else if (input.wind.tailwindKt >= 1) {
      windKind = "tailwind";
      windKt = input.wind.tailwindKt;
    } else {
      windKind = "calm";
      windKt = 0;
    }
  }

  const nextSeconds = input.atc?.status === "available" ? input.atc.nextSector?.estimatedSeconds ?? null : null;
  return {
    phase: observedPhase(input.aircraft),
    currentSector: input.atc?.status === "available" ? input.atc.primaryAirspace?.name ?? null : null,
    currentUnit: input.atc?.status === "available" ? input.atc.primaryAirspace?.publishedUnit ?? null : null,
    nextSector: input.atc?.status === "available" ? input.atc.nextSector?.airspace.name ?? null : null,
    nextSectorMinutes: nextSeconds === null ? null : Math.max(1, Math.round(nextSeconds / 60)),
    nextSectorConfidence: input.atc?.status === "available" ? input.atc.nextSector?.confidence ?? null : null,
    weatherState,
    weatherHazard,
    weatherDistanceNm,
    weatherStale: Boolean(input.sigmetStale || input.routeWeather?.stale),
    windKind,
    windKt,
    windTrend: input.windAhead?.trend ?? null,
    windTrendDeltaKt: input.windAhead ? Math.abs(input.windAhead.deltaAlongTrackKt) : null,
    routeDeviationNearSigmet: input.sigmetDeviation !== null,
  };
}
