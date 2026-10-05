import type { Aircraft } from "@/lib/aircraft/types";
import type { Airport } from "@/lib/airports/types";
import { haversineDistanceKm } from "@/lib/geo";
import { SAMPLE_AIRPORTS } from "@/lib/server/airport-catalog";
import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { queryAircraftWeatherObservations } from "@/lib/server/aircraft-weather";
import { defaultAviationWeatherProvider } from "@/lib/server/aviation-weather-provider";
import { getPrisma } from "@/lib/server/db";
import { defaultPirepProvider } from "@/lib/server/pirep-provider";
import { defaultWindAloftProvider } from "@/lib/server/wind-aloft";
import { aircraftSigmetContext } from "@/lib/weather/aircraft-sigmet-context";
import { buildAircraftWindContext, windLevelForAltitude } from "@/lib/weather/aircraft-wind-context";
import { buildWeatherFusion, type WeatherFusionMetarInput, type WeatherFusionResult, type WeatherFusionSource } from "@/lib/weather/fusion";

const LIVE_MAX_AGE_MS = 60_000;
const AIRCRAFT_OBSERVATION_WINDOW_MS = 30 * 60_000;
const METAR_RADIUS_NM = 120;
const PIREP_RADIUS_NM = 120;
const PIREP_HOURS = 6;
const MAX_METAR_AIRPORTS = 6;

export type WeatherFusionServiceResponse =
  | { status: "available"; fusion: WeatherFusionResult }
  | { status: "unavailable" | "stale"; reason: string };

function altitudeFt(aircraft: Aircraft): number | null {
  const value = aircraft.baroAltitude ?? aircraft.altitude ?? aircraft.geomAltitude;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function nearbyAirportCandidates(lat: number, lon: number): Promise<Airport[]> {
  const radiusKm = METAR_RADIUS_NM * 1.852;
  const database = getPrisma();
  if (database) {
    try {
      const radiusLat = radiusKm / 111.32;
      const radiusLon = radiusKm / (111.32 * Math.max(Math.cos(lat * Math.PI / 180), 0.2));
      const rows = await database.orm.public.Airport
        .where((airport) => airport.latitude.gte(Math.max(-90, lat - radiusLat)))
        .where((airport) => airport.latitude.lte(Math.min(90, lat + radiusLat)))
        .where((airport) => airport.longitude.gte(Math.max(-180, lon - radiusLon)))
        .where((airport) => airport.longitude.lte(Math.min(180, lon + radiusLon)))
        .limit(256)
        .all();
      const airports = rows.map((airport): Airport => ({
        icaoCode: airport.icao,
        iataCode: airport.iata,
        name: airport.name,
        city: airport.city,
        country: airport.country,
        latitude: airport.latitude,
        longitude: airport.longitude,
        type: airport.type,
        elevationFt: airport.elevationFt,
        scheduledService: airport.scheduledService,
        region: airport.region,
        localCode: airport.localCode,
      }));
      const nearby = airports
        .map((airport) => ({ airport, distance: haversineDistanceKm(lat, lon, airport.latitude, airport.longitude) }))
        .filter((item) => item.distance <= radiusKm)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, MAX_METAR_AIRPORTS)
        .map((item) => item.airport);
      if (nearby.length) return nearby;
    } catch {
      // Database airport catalog is optional for weather fusion.
    }
  }
  return SAMPLE_AIRPORTS
    .map((airport) => ({ airport, distance: haversineDistanceKm(lat, lon, airport.latitude, airport.longitude) }))
    .filter((item) => item.distance <= radiusKm)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, MAX_METAR_AIRPORTS)
    .map((item) => item.airport);
}

async function nearestMetar(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<WeatherFusionMetarInput | null> {
  const airports = await nearbyAirportCandidates(lat, lon);
  if (!airports.length) return null;
  const results = await Promise.allSettled(
    airports.slice(0, MAX_METAR_AIRPORTS).map(async (airport) => ({
      airport,
      weather: await defaultAviationWeatherProvider.getAirportWeather(airport.icaoCode, signal),
    })),
  );
  return results
    .flatMap((result) => {
      if (result.status !== "fulfilled" || !result.value.weather.metar) return [];
      const { airport, weather } = result.value;
      const metar = weather.metar;
      const distance = haversineDistanceKm(lat, lon, airport.latitude, airport.longitude) / 1.852;
      if (distance > METAR_RADIUS_NM) return [];
      return [{
        stationId: airport.icaoCode,
        observedAt: metar.observedAt ?? metar.observationTime,
        temperatureC: metar.temperatureC,
        rawText: metar.rawText,
        stale: weather.stale || metar.stale === true,
        distanceNm: distance,
      } satisfies WeatherFusionMetarInput];
    })
    .sort((a, b) => a.distanceNm - b.distanceNm)[0] ?? null;
}

function sourceState<T>(result: PromiseSettledResult<T>, stale = false): "AVAILABLE" | "STALE" | "UNAVAILABLE" {
  if (result.status === "rejected") return "UNAVAILABLE";
  return stale ? "STALE" : "AVAILABLE";
}

export async function getAircraftWeatherFusion(
  aircraftHex: string,
  options: { signal?: AbortSignal; now?: Date } = {},
): Promise<WeatherFusionServiceResponse> {
  const now = options.now ?? new Date();
  const aircraft = getAircraftStateService().getAircraft(aircraftHex, "local");
  if (!aircraft || aircraft.lat === null || aircraft.lon === null) {
    return { status: "unavailable", reason: "Aircraft has no live local position" };
  }
  const lastSeen = Date.parse(aircraft.lastSeen);
  if (!Number.isFinite(lastSeen) || now.getTime() - lastSeen > LIVE_MAX_AGE_MS || (aircraft.seenPosSeconds !== null && aircraft.seenPosSeconds > 60)) {
    return { status: "stale", reason: "Aircraft position is older than 60 seconds" };
  }

  const altitude = altitudeFt(aircraft);
  const windLevel = aircraft.onGround ? null : windLevelForAltitude(altitude);
  const from = new Date(now.getTime() - AIRCRAFT_OBSERVATION_WINDOW_MS);

  const [aircraftWeatherResult, pirepResult, sigmetResult, metarResult, windResult] = await Promise.allSettled([
    queryAircraftWeatherObservations({
      from,
      to: new Date(now.getTime() + 1_000),
      aircraftHex: aircraft.icaoHex.toUpperCase(),
      limit: 8,
    }),
    defaultPirepProvider.getPireps({
      latitude: aircraft.lat,
      longitude: aircraft.lon,
      radiusNm: PIREP_RADIUS_NM,
      hours: PIREP_HOURS,
      altitudeFt: altitude,
    }, options.signal),
    defaultAviationWeatherProvider.getSigmets(options.signal),
    nearestMetar(aircraft.lat, aircraft.lon, options.signal),
    windLevel === null
      ? Promise.resolve(null)
      : defaultWindAloftProvider.getWind(windLevel).then((snapshot) => buildAircraftWindContext(aircraft, snapshot)),
  ]);

  const observations = aircraftWeatherResult.status === "fulfilled" ? aircraftWeatherResult.value.observations : [];
  const pireps = pirepResult.status === "fulfilled" ? pirepResult.value.reports : [];
  const sigmetSnapshot = sigmetResult.status === "fulfilled" ? sigmetResult.value : null;
  const sigmets = sigmetSnapshot ? aircraftSigmetContext(aircraft, sigmetSnapshot) : [];
  const metar = metarResult.status === "fulfilled" ? metarResult.value : null;
  const modelWind = windResult.status === "fulfilled" ? windResult.value : null;

  const latestObservation = observations[0] ?? null;
  const sourceAvailability: Partial<Record<WeatherFusionSource, "AVAILABLE" | "STALE" | "UNAVAILABLE">> = {
    AIRCRAFT_BDS44: latestObservation?.source === "BDS_4_4" ? sourceState(aircraftWeatherResult) : "UNAVAILABLE",
    AIRCRAFT_OTHER: latestObservation && latestObservation.source !== "BDS_4_4" ? sourceState(aircraftWeatherResult) : "UNAVAILABLE",
    PIREP_AIREP: sourceState(pirepResult, pirepResult.status === "fulfilled" && pirepResult.value.stale),
    SIGMET: sourceState(sigmetResult, sigmetResult.status === "fulfilled" && sigmetResult.value.stale),
    METAR: sourceState(metarResult, metar?.stale === true),
    ICON_EU: windLevel === null ? "UNAVAILABLE" : sourceState(windResult, modelWind?.stale === true),
  };
  // If the aircraft-weather query worked but simply had no recent observation,
  // neither aircraft-observation source should be presented as an upstream error.
  if (aircraftWeatherResult.status === "fulfilled" && !latestObservation) {
    sourceAvailability.AIRCRAFT_BDS44 = "UNAVAILABLE";
    sourceAvailability.AIRCRAFT_OTHER = "UNAVAILABLE";
  }

  return {
    status: "available",
    fusion: buildWeatherFusion({
      aircraftHex: aircraft.icaoHex,
      lat: aircraft.lat,
      lon: aircraft.lon,
      altitudeFt: altitude,
      now,
      aircraftObservations: observations,
      pireps,
      sigmets,
      metar,
      modelWind,
      sourceAvailability,
    }),
  };
}
