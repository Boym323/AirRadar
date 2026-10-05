import { haversineDistanceKm } from "@/lib/geo";
import type { OperationalTwinCorridor, OperationalTwinTrajectoryPoint } from "@/lib/operational-twin/types";
import {
  sampleWindAtPosition,
  windLevelForAltitude,
  type AircraftWindSnapshot,
} from "@/lib/weather/aircraft-wind-context";
import {
  classifyPirepSeverity,
  classifyWeatherHazard,
  type WeatherFusionConfidence,
  type WeatherFusionRiskKind,
  type WeatherFusionSeverity,
} from "@/lib/weather/fusion";
import { pointInSigmetGeometry } from "@/lib/weather/aircraft-sigmet-context";
import type { PirepSnapshot, SigmetSnapshot } from "@/lib/weather/types";

export const WEATHER_CORRIDOR_VERSION = "weather-corridor-intelligence-v1" as const;

export type WeatherCorridorEventType = "TURBULENCE" | "ICING" | "SIGMET_ENTRY" | "SIGMET_EXIT";
export type WeatherCorridorSource = "PIREP_AIREP" | "SIGMET" | "ICON_EU";
export type WeatherCorridorSourceState = "AVAILABLE" | "STALE" | "UNAVAILABLE";

export interface WeatherCorridorEvent {
  id: string;
  type: WeatherCorridorEventType;
  risk: WeatherFusionRiskKind;
  offsetMinutes: number;
  at: string;
  distanceAlongCorridorNm: number;
  lat: number;
  lon: number;
  altitudeFt: number | null;
  severity: Exclude<WeatherFusionSeverity, "UNKNOWN">;
  confidence: WeatherFusionConfidence;
  source: WeatherCorridorSource;
  sourceReference: string;
  evidence: string[];
}

export interface WeatherCorridorWindSample {
  offsetMinutes: number;
  at: string;
  distanceAlongCorridorNm: number;
  altitudeFt: number | null;
  levelHpa: number;
  windSpeedKt: number;
  windFromDeg: number;
  headwindKt: number;
  tailwindKt: number;
  crosswindKt: number;
  sourceDistanceKm: number;
}

export interface WeatherCorridorWindProfile {
  status: "AVAILABLE" | "STALE" | "UNAVAILABLE";
  model: "ICON-EU" | null;
  trend: "MORE_HEADWIND" | "MORE_TAILWIND" | "STABLE" | "VARIABLE" | "UNAVAILABLE";
  deltaAlongTrackKt: number | null;
  samples: WeatherCorridorWindSample[];
}

export interface WeatherCorridorSourceSummary {
  source: WeatherCorridorSource;
  state: WeatherCorridorSourceState;
  count: number;
}

export interface WeatherCorridorIntelligence {
  version: typeof WEATHER_CORRIDOR_VERSION;
  status: "AVAILABLE" | "PARTIAL" | "INSUFFICIENT";
  horizonMinutes: number;
  corridorMode: OperationalTwinCorridor["mode"];
  routePrecision: string | null;
  events: WeatherCorridorEvent[];
  wind: WeatherCorridorWindProfile;
  sources: WeatherCorridorSourceSummary[];
}

export interface WeatherCorridorInput {
  corridor: OperationalTwinCorridor;
  pireps: PirepSnapshot | null;
  sigmets: SigmetSnapshot | null;
  windSnapshots: readonly AircraftWindSnapshot[];
  now?: Date;
}

const KM_PER_NM = 1.852;
const MAX_PIREP_DISTANCE_NM = 40;
const MAX_PIREP_ALTITUDE_DELTA_FT = 8_000;
const WIND_SAMPLE_OFFSETS = [0, 10, 20, 30] as const;
const MAX_EVENTS = 16;

function distanceNm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  return haversineDistanceKm(a.lat, a.lon, b.lat, b.lon) / KM_PER_NM;
}

function cumulativeDistances(points: readonly OperationalTwinTrajectoryPoint[]): number[] {
  const result: number[] = [];
  let total = 0;
  for (let index = 0; index < points.length; index += 1) {
    if (index > 0) total += distanceNm(points[index - 1]!, points[index]!);
    result.push(total);
  }
  return result;
}

function pointAltitudeRelation(
  altitudeFt: number | null,
  lowerFt: number | null,
  upperFt: number | null,
): "matched" | "unknown" | "outside" {
  if (altitudeFt === null || (lowerFt === null && upperFt === null)) return "unknown";
  if (lowerFt !== null && altitudeFt < lowerFt) return "outside";
  if (upperFt !== null && altitudeFt > upperFt) return "outside";
  return "matched";
}

function sigmetValidAt(
  feature: SigmetSnapshot["features"][number],
  at: string,
): boolean {
  const timestamp = Date.parse(at);
  if (!Number.isFinite(timestamp)) return false;
  const from = feature.properties.validFrom ? Date.parse(feature.properties.validFrom) : Number.NEGATIVE_INFINITY;
  const to = feature.properties.validTo ? Date.parse(feature.properties.validTo) : Number.POSITIVE_INFINITY;
  if (feature.properties.validFrom && !Number.isFinite(from)) return false;
  if (feature.properties.validTo && !Number.isFinite(to)) return false;
  return timestamp >= from && timestamp <= to;
}

function sigmetConfidence(
  vertical: "matched" | "unknown" | "outside",
  stale: boolean,
): WeatherFusionConfidence {
  if (stale) return "LOW";
  return vertical === "matched" ? "HIGH" : "MEDIUM";
}

function pirepConfidence(input: {
  distanceNm: number;
  altitudeDeltaFt: number | null;
  ageMinutes: number;
  stale: boolean;
}): WeatherFusionConfidence {
  if (input.stale || input.ageMinutes > 180) return "LOW";
  if (input.distanceNm <= 15 && input.altitudeDeltaFt !== null && input.altitudeDeltaFt <= 3_000 && input.ageMinutes <= 120) {
    return "HIGH";
  }
  if (input.distanceNm <= 30 && (input.altitudeDeltaFt === null || input.altitudeDeltaFt <= 6_000)) return "MEDIUM";
  return "LOW";
}

function pirepEvent(
  report: PirepSnapshot["reports"][number],
  risk: Extract<WeatherFusionRiskKind, "TURBULENCE" | "ICING">,
  severity: Exclude<WeatherFusionSeverity, "UNKNOWN">,
  corridor: OperationalTwinCorridor,
  distances: readonly number[],
  now: Date,
  stale: boolean,
): WeatherCorridorEvent | null {
  if (severity === "NONE") return null;
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestAltitudeDelta: number | null = null;

  for (let index = 1; index < corridor.points.length; index += 1) {
    const point = corridor.points[index]!;
    const horizontal = distanceNm(
      { lat: report.latitude, lon: report.longitude },
      { lat: point.lat, lon: point.lon },
    );
    const threshold = Math.min(MAX_PIREP_DISTANCE_NM, Math.max(20, point.uncertaintyNm + 15));
    if (horizontal > threshold || horizontal >= bestDistance) continue;
    const altitudeDelta = report.altitudeFt === null || point.altitudeFt === null
      ? null
      : Math.abs(report.altitudeFt - point.altitudeFt);
    if (altitudeDelta !== null && altitudeDelta > MAX_PIREP_ALTITUDE_DELTA_FT) continue;
    bestIndex = index;
    bestDistance = horizontal;
    bestAltitudeDelta = altitudeDelta;
  }

  if (bestIndex < 0) return null;
  const point = corridor.points[bestIndex]!;
  const ageMinutes = Math.max(0, (now.getTime() - Date.parse(report.observedAt)) / 60_000);
  return {
    id: `pirep:${report.id}:${risk}`,
    type: risk,
    risk,
    offsetMinutes: point.offsetMinutes,
    at: point.at,
    distanceAlongCorridorNm: Number((distances[bestIndex] ?? 0).toFixed(1)),
    lat: point.lat,
    lon: point.lon,
    altitudeFt: point.altitudeFt,
    severity,
    confidence: pirepConfidence({
      distanceNm: bestDistance,
      altitudeDeltaFt: bestAltitudeDelta,
      ageMinutes,
      stale,
    }),
    source: "PIREP_AIREP",
    sourceReference: report.id,
    evidence: [
      `${report.reportType} ${risk.toLowerCase()} ${report.turbulence?.intensity ?? report.icing?.intensity ?? ""}`.trim(),
      `${bestDistance.toFixed(1)} NM from projected corridor`,
      bestAltitudeDelta === null ? "altitude relation unknown" : `altitude Δ ${Math.round(bestAltitudeDelta)} ft`,
      `report age ${Math.round(ageMinutes)} min`,
    ],
  };
}

function buildPirepEvents(
  snapshot: PirepSnapshot | null,
  corridor: OperationalTwinCorridor,
  distances: readonly number[],
  now: Date,
): WeatherCorridorEvent[] {
  if (!snapshot) return [];
  const events: WeatherCorridorEvent[] = [];
  for (const report of snapshot.reports) {
    const turbulence = classifyPirepSeverity(report.turbulence?.intensity);
    if (turbulence) {
      const event = pirepEvent(report, "TURBULENCE", turbulence, corridor, distances, now, snapshot.stale);
      if (event) events.push(event);
    }
    const icing = classifyPirepSeverity(report.icing?.intensity);
    if (icing) {
      const event = pirepEvent(report, "ICING", icing, corridor, distances, now, snapshot.stale);
      if (event) events.push(event);
    }
  }
  return events;
}

function buildSigmetEvents(
  snapshot: SigmetSnapshot | null,
  corridor: OperationalTwinCorridor,
  distances: readonly number[],
): WeatherCorridorEvent[] {
  if (!snapshot) return [];
  const events: WeatherCorridorEvent[] = [];

  for (const feature of snapshot.features) {
    const risk = classifyWeatherHazard(feature.properties.hazard, feature.properties.phenomenon);
    if (!risk) continue;
    let wasInside = false;
    let emittedEntry = false;
    let emittedExit = false;

    for (let index = 0; index < corridor.points.length; index += 1) {
      const point = corridor.points[index]!;
      const vertical = pointAltitudeRelation(point.altitudeFt, feature.properties.lowerFt, feature.properties.upperFt);
      const inside = vertical !== "outside"
        && sigmetValidAt(feature, point.at)
        && pointInSigmetGeometry(point.lon, point.lat, feature.geometry);

      if (inside && !wasInside && !emittedEntry) {
        events.push({
          id: `sigmet:${feature.id}:entry`,
          type: "SIGMET_ENTRY",
          risk,
          offsetMinutes: point.offsetMinutes,
          at: point.at,
          distanceAlongCorridorNm: Number((distances[index] ?? 0).toFixed(1)),
          lat: point.lat,
          lon: point.lon,
          altitudeFt: point.altitudeFt,
          severity: "HIGH",
          confidence: sigmetConfidence(vertical, snapshot.stale),
          source: "SIGMET",
          sourceReference: feature.id,
          evidence: [
            feature.properties.hazard ?? feature.properties.phenomenon ?? "SIGMET",
            vertical === "matched" ? "projected altitude inside published vertical limits" : "published vertical relation unknown",
            snapshot.stale ? "SIGMET snapshot stale" : "SIGMET snapshot current",
          ],
        });
        emittedEntry = true;
      } else if (!inside && wasInside && emittedEntry && !emittedExit) {
        events.push({
          id: `sigmet:${feature.id}:exit`,
          type: "SIGMET_EXIT",
          risk,
          offsetMinutes: point.offsetMinutes,
          at: point.at,
          distanceAlongCorridorNm: Number((distances[index] ?? 0).toFixed(1)),
          lat: point.lat,
          lon: point.lon,
          altitudeFt: point.altitudeFt,
          severity: "HIGH",
          confidence: snapshot.stale ? "LOW" : "MEDIUM",
          source: "SIGMET",
          sourceReference: feature.id,
          evidence: [
            feature.properties.hazard ?? feature.properties.phenomenon ?? "SIGMET",
            "first sampled corridor point outside the advisory after entry",
          ],
        });
        emittedExit = true;
      }
      wasInside = inside;
    }
  }
  return events;
}

function nearestCorridorPoint(corridor: OperationalTwinCorridor, offsetMinutes: number): OperationalTwinTrajectoryPoint | null {
  if (!corridor.points.length) return null;
  return corridor.points.reduce((best, point) =>
    Math.abs(point.offsetMinutes - offsetMinutes) < Math.abs(best.offsetMinutes - offsetMinutes) ? point : best,
  );
}

function buildWindProfile(
  corridor: OperationalTwinCorridor,
  distances: readonly number[],
  snapshots: readonly AircraftWindSnapshot[],
): WeatherCorridorWindProfile {
  const byLevel = new Map(snapshots.map((snapshot) => [snapshot.levelHpa, snapshot]));
  const samples: WeatherCorridorWindSample[] = [];

  for (const requestedOffset of WIND_SAMPLE_OFFSETS) {
    if (requestedOffset > corridor.horizonMinutes) continue;
    const point = nearestCorridorPoint(corridor, requestedOffset);
    if (!point || point.trackDeg === null) continue;
    const level = windLevelForAltitude(point.altitudeFt);
    if (level === null) continue;
    const snapshot = byLevel.get(level);
    if (!snapshot) continue;
    const sample = sampleWindAtPosition(point.lat, point.lon, point.trackDeg, snapshot);
    if (!sample) continue;
    const pointIndex = corridor.points.indexOf(point);
    samples.push({
      offsetMinutes: point.offsetMinutes,
      at: point.at,
      distanceAlongCorridorNm: Number((distances[pointIndex] ?? 0).toFixed(1)),
      altitudeFt: point.altitudeFt,
      levelHpa: level,
      windSpeedKt: Number(sample.windSpeedKt.toFixed(1)),
      windFromDeg: Number(sample.windFromDeg.toFixed(0)),
      headwindKt: Number(sample.headwindKt.toFixed(1)),
      tailwindKt: Number(sample.tailwindKt.toFixed(1)),
      crosswindKt: Number(sample.crosswindKt.toFixed(1)),
      sourceDistanceKm: Number(sample.sourceDistanceKm.toFixed(1)),
    });
  }

  if (!samples.length) {
    return { status: "UNAVAILABLE", model: null, trend: "UNAVAILABLE", deltaAlongTrackKt: null, samples: [] };
  }

  const stale = snapshots.some((snapshot) => snapshot.stale);
  const first = samples[0]!;
  const last = samples[samples.length - 1]!;
  const signed = (sample: WeatherCorridorWindSample) => sample.headwindKt - sample.tailwindKt;
  const delta = signed(last) - signed(first);
  const deltas = samples.slice(1).map((sample) => signed(sample) - signed(first)).filter((value) => Math.abs(value) >= 8);
  const positive = deltas.some((value) => value > 0);
  const negative = deltas.some((value) => value < 0);
  const trend: WeatherCorridorWindProfile["trend"] = positive && negative
    ? "VARIABLE"
    : delta >= 10
      ? "MORE_HEADWIND"
      : delta <= -10
        ? "MORE_TAILWIND"
        : "STABLE";

  return {
    status: stale ? "STALE" : "AVAILABLE",
    model: "ICON-EU",
    trend,
    deltaAlongTrackKt: Number(delta.toFixed(1)),
    samples,
  };
}

export function buildWeatherCorridorIntelligence(input: WeatherCorridorInput): WeatherCorridorIntelligence {
  const now = input.now ?? new Date();
  const distances = cumulativeDistances(input.corridor.points);
  const pirepEvents = buildPirepEvents(input.pireps, input.corridor, distances, now);
  const sigmetEvents = buildSigmetEvents(input.sigmets, input.corridor, distances);
  const wind = buildWindProfile(input.corridor, distances, input.windSnapshots);

  const events = [...pirepEvents, ...sigmetEvents]
    .sort((a, b) =>
      a.offsetMinutes - b.offsetMinutes
      || (a.type === "SIGMET_ENTRY" ? -1 : b.type === "SIGMET_ENTRY" ? 1 : 0)
      || a.id.localeCompare(b.id),
    )
    .slice(0, MAX_EVENTS);

  const sources: WeatherCorridorSourceSummary[] = [
    {
      source: "PIREP_AIREP",
      state: input.pireps ? input.pireps.stale ? "STALE" : "AVAILABLE" : "UNAVAILABLE",
      count: input.pireps?.reports.length ?? 0,
    },
    {
      source: "SIGMET",
      state: input.sigmets ? input.sigmets.stale ? "STALE" : "AVAILABLE" : "UNAVAILABLE",
      count: input.sigmets?.features.length ?? 0,
    },
    {
      source: "ICON_EU",
      state: wind.status,
      count: wind.samples.length,
    },
  ];

  const available = sources.filter((source) => source.state !== "UNAVAILABLE").length;
  return {
    version: WEATHER_CORRIDOR_VERSION,
    status: available >= 2 ? "AVAILABLE" : available === 1 ? "PARTIAL" : "INSUFFICIENT",
    horizonMinutes: input.corridor.horizonMinutes,
    corridorMode: input.corridor.mode,
    routePrecision: input.corridor.routePrecision,
    events,
    wind,
    sources,
  };
}
