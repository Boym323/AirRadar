import type { MetarObservation, SigmetGeometry } from "@/lib/weather/types";
import { pointInSigmetGeometry } from "@/lib/weather/aircraft-sigmet-context";

export type WeatherFreshnessState = "FRESH" | "STALE" | "OFFLINE";
export interface WeatherFreshness {
  source: "METAR" | "RADAR" | "WIND" | "SIGMET";
  observedAt: string | null;
  ageSeconds: number | null;
  state: WeatherFreshnessState;
}

export function weatherFreshness(
  source: WeatherFreshness["source"],
  observedAt: string | Date | null | undefined,
  now = new Date(),
  staleAfterSeconds = 30 * 60,
): WeatherFreshness {
  const parsed = observedAt instanceof Date ? observedAt.getTime() : observedAt ? Date.parse(observedAt) : Number.NaN;
  if (!Number.isFinite(parsed)) return { source, observedAt: null, ageSeconds: null, state: "OFFLINE" };
  const ageSeconds = Math.max(0, Math.round((now.getTime() - parsed) / 1000));
  return { source, observedAt: new Date(parsed).toISOString(), ageSeconds, state: ageSeconds <= staleAfterSeconds ? "FRESH" : "STALE" };
}

export type WindComponentKind = "HEADWIND" | "TAILWIND" | "CROSSWIND_LEFT" | "CROSSWIND_RIGHT" | "UNKNOWN";
export interface WindComponent { kind: WindComponentKind; knots: number | null; signedKnots: number | null; }

/** Wind direction is the meteorological direction the air comes from. */
export function windComponent(trackDeg: number | null, windFromDeg: number | null, windSpeedKt: number | null): WindComponent {
  if (trackDeg === null || windFromDeg === null || windSpeedKt === null || ![trackDeg, windFromDeg, windSpeedKt].every(Number.isFinite)) return { kind: "UNKNOWN", knots: null, signedKnots: null };
  const angle = (windFromDeg - trackDeg) * Math.PI / 180;
  const headwind = -windSpeedKt * Math.cos(angle);
  const crosswind = windSpeedKt * Math.sin(angle);
  if (Math.abs(crosswind) > Math.abs(headwind)) return { kind: crosswind >= 0 ? "CROSSWIND_RIGHT" : "CROSSWIND_LEFT", knots: Math.round(Math.abs(crosswind)), signedKnots: Number(crosswind.toFixed(1)) };
  return { kind: headwind >= 0 ? "HEADWIND" : "TAILWIND", knots: Math.round(Math.abs(headwind)), signedKnots: Number(headwind.toFixed(1)) };
}

export interface WeatherSigmetInput { id: string; geometry: SigmetGeometry; observedAt?: string | null; }
export interface SigmetProximity {
  id: string;
  inside: boolean;
  distanceNm: number | null;
  relation: "inside" | "approaching" | "moving_away" | "nearby";
  freshness: WeatherFreshness;
}

function distanceNm(a: [number, number], b: [number, number]): number {
  const dLat = (b[1] - a[1]) * Math.PI / 180;
  const dLon = (b[0] - a[0]) * Math.PI / 180;
  const lat = a[1] * Math.PI / 180;
  const lat2 = b[1] * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 3440.065 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function polygonDistanceNm(lon: number, lat: number, geometry: SigmetGeometry): number {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let best = Number.POSITIVE_INFINITY;
  for (const polygon of polygons) for (const ring of polygon) for (let index = 1; index < ring.length; index += 1) {
    const left = ring[index - 1]; const right = ring[index];
    if (!left || !right) continue;
    const fraction = Math.max(0, Math.min(1, ((lon - left[0]) * (right[0] - left[0]) + (lat - left[1]) * (right[1] - left[1])) / ((right[0] - left[0]) ** 2 + (right[1] - left[1]) ** 2 || 1)));
    best = Math.min(best, distanceNm([lon, lat], [left[0] + (right[0] - left[0]) * fraction, left[1] + (right[1] - left[1]) * fraction]));
  }
  return Number.isFinite(best) ? best : 0;
}

export function sigmetProximity(
  longitude: number,
  latitude: number,
  sigmet: WeatherSigmetInput,
  previousPosition?: { longitude: number; latitude: number },
  now = new Date(),
): SigmetProximity {
  const inside = pointInSigmetGeometry(longitude, latitude, sigmet.geometry);
  if (inside) return { id: sigmet.id, inside: true, distanceNm: 0, relation: "inside", freshness: weatherFreshness("SIGMET", sigmet.observedAt, now) };
  const distance = polygonDistanceNm(longitude, latitude, sigmet.geometry);
  const previousDistance = previousPosition
    ? pointInSigmetGeometry(previousPosition.longitude, previousPosition.latitude, sigmet.geometry)
      ? 0
      : polygonDistanceNm(previousPosition.longitude, previousPosition.latitude, sigmet.geometry)
    : null;
  const relation = previousDistance !== null && distance < previousDistance - 0.1 ? "approaching" : previousDistance !== null && distance > previousDistance + 0.1 ? "moving_away" : "nearby";
  return { id: sigmet.id, inside: false, distanceNm: Number(distance.toFixed(1)), relation, freshness: weatherFreshness("SIGMET", sigmet.observedAt, now) };
}

export interface WeatherAroundAircraft {
  nearestMetar: { stationId: string; distanceNm: number; observation: MetarObservation } | null;
  sigmets: SigmetProximity[];
  radarPrecipitationProximityNm: number | null;
  wind: WindComponent;
  freshness: WeatherFreshness[];
}

export function weatherAroundAircraft(input: {
  longitude: number;
  latitude: number;
  track: number | null;
  metars: readonly MetarObservation[];
  sigmets: readonly WeatherSigmetInput[];
  radar?: readonly { longitude: number; latitude: number; precipitation: boolean; observedAt?: string | null }[];
  wind?: { fromDeg: number | null; speedKt: number | null; observedAt?: string | null };
  previousPosition?: { longitude: number; latitude: number };
  now?: Date;
}): WeatherAroundAircraft {
  const now = input.now ?? new Date();
  const nearest = input.metars.filter((item): item is MetarObservation & { stationId: string; latitude: number; longitude: number } => Boolean(item.stationId && item.latitude !== null && item.latitude !== undefined && item.longitude !== null && item.longitude !== undefined)).map((item) => ({ stationId: item.stationId, distanceNm: distanceNm([input.longitude, input.latitude], [item.longitude, item.latitude]), observation: item })).sort((a, b) => a.distanceNm - b.distanceNm)[0] ?? null;
  const sigmets = input.sigmets.map((sigmet) => sigmetProximity(input.longitude, input.latitude, sigmet, input.previousPosition, now));
  const precipitation = input.radar?.filter((cell) => cell.precipitation).map((cell) => ({ distance: distanceNm([input.longitude, input.latitude], [cell.longitude, cell.latitude]), freshness: weatherFreshness("RADAR", cell.observedAt, now) })).sort((a, b) => a.distance - b.distance)[0] ?? null;
  const wind = windComponent(input.track, input.wind?.fromDeg ?? null, input.wind?.speedKt ?? null);
  return {
    nearestMetar: nearest,
    sigmets,
    radarPrecipitationProximityNm: precipitation?.distance ?? null,
    wind,
    freshness: [weatherFreshness("METAR", nearest?.observation.observedAt ?? null, now), weatherFreshness("RADAR", precipitation?.freshness.observedAt ?? null, now), weatherFreshness("WIND", input.wind?.observedAt, now), ...sigmets.map((item) => item.freshness)],
  };
}
