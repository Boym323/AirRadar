import type { Airport } from "@/lib/airports/types";
import { airportVisibilityTier } from "@/lib/airport-visibility";
import type { MetarMapObservation } from "@/lib/weather/types";
import type { AircraftWeatherMapObservation } from "@/components/aircraft-weather-panel";

/** Pure 2D radar map-source builders. Keep stable GeoJSON shapes for MapLibre. */
export function createAirportGeoJSON(airports: Airport[], excludedAirportCodes: ReadonlySet<string> = new Set()) {
  const unique = new Map(airports
    .filter((airport) => Number.isFinite(airport.latitude) && Number.isFinite(airport.longitude)
      && airport.latitude >= -90 && airport.latitude <= 90
      && airport.longitude >= -180 && airport.longitude <= 180
      && !excludedAirportCodes.has(airport.icaoCode.trim().toUpperCase()))
    .map((airport) => [airport.icaoCode, airport]));
  return {
    type: "FeatureCollection" as const,
    features: [...unique.values()].map((airport) => ({
      type: "Feature" as const,
      properties: {
        code: airport.iataCode ? `${airport.iataCode}/${airport.icaoCode}` : airport.icaoCode,
        icao: airport.icaoCode,
        name: airport.name,
        tier: airportVisibilityTier(airport),
        important: false,
      },
      geometry: { type: "Point" as const, coordinates: [airport.longitude, airport.latitude] },
    })),
  };
}

export function createMetarGeoJSON(observations: MetarMapObservation[]) {
  return {
    type: "FeatureCollection" as const,
    features: observations.flatMap((observation) => Number.isFinite(observation.lat) && Number.isFinite(observation.lon) ? [{
      type: "Feature" as const,
      properties: observation,
      geometry: { type: "Point" as const, coordinates: [observation.lon, observation.lat] },
    }] : []),
  };
}

export function createAircraftWeatherGeoJSON(observations: AircraftWeatherMapObservation[], field: "temperature" | "wind") {
  return {
    type: "FeatureCollection" as const,
    features: observations.flatMap((observation) => Number.isFinite(observation.lat) && Number.isFinite(observation.lon) ? [{
      type: "Feature" as const,
      properties: {
        key: `${observation.aircraftHex}|${observation.observedAt}`,
        aircraftHex: observation.aircraftHex,
        callsign: observation.callsign,
        altitudeFt: observation.altitudeFt,
        observedAt: observation.observedAt,
        field,
        temperatureC: observation.staticAirTemperatureC,
        windDirectionDeg: observation.windDirectionDeg,
        windSpeedKt: observation.windSpeedKt,
        source: observation.source,
      },
      geometry: { type: "Point" as const, coordinates: [observation.lon, observation.lat] as [number, number] },
    }] : []),
  };
}

