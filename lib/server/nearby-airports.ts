import type { Airport } from "@/lib/airports/types";
import { haversineDistanceKm, initialBearing } from "@/lib/geo";
import { SAMPLE_AIRPORTS } from "@/lib/server/airport-catalog";
import { getPrisma } from "@/lib/server/db";
import { normalizeAirportIcao, normalizeAirportIata } from "@/lib/server/airport-resolver";

export const NEARBY_AIRPORT_LIMIT = 12;
const NEARBY_SEARCH_RADIUS_KM = 500;
const NEARBY_CANDIDATE_LIMIT = 1_000;

export interface NearbyAirport {
  airport: Airport;
  distanceKm: number;
  bearing: number;
}

interface AirportRow {
  icao: string;
  iata: string | null;
  name: string;
  city: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
}

interface AirportField {
  gte(value: number): unknown;
  lte(value: number): unknown;
}

interface NearbyAirportQuery {
  where(predicate: (airport: { latitude: AirportField; longitude: AirportField }) => unknown): NearbyAirportQuery;
  limit(value: number): { all(): Promise<AirportRow[]> };
}

interface NearbyAirportTable {
  where(predicate: (airport: { latitude: AirportField; longitude: AirportField }) => unknown): NearbyAirportQuery;
}

function validAirport(row: AirportRow): Airport | null {
  const icaoCode = normalizeAirportIcao(row.icao);
  if (!icaoCode || !Number.isFinite(row.latitude) || !Number.isFinite(row.longitude)
    || row.latitude < -90 || row.latitude > 90 || row.longitude < -180 || row.longitude > 180) {
    return null;
  }
  return {
    icaoCode,
    iataCode: normalizeAirportIata(row.iata),
    name: row.name,
    city: row.city,
    country: row.country,
    latitude: row.latitude,
    longitude: row.longitude,
  };
}

function latitudeDelta(radiusKm: number): number {
  return radiusKm / 111.32;
}

function longitudeDelta(radiusKm: number, latitude: number): number {
  const scale = Math.max(Math.cos(latitude * Math.PI / 180), 0.2);
  return radiusKm / (111.32 * scale);
}

function toNearby(target: Airport, candidates: readonly Airport[], limit: number): NearbyAirport[] {
  const targetIcao = target.icaoCode.trim().toUpperCase();
  return candidates
    .filter((airport) => airport.icaoCode.trim().toUpperCase() !== targetIcao)
    .map((airport) => ({
      airport,
      distanceKm: haversineDistanceKm(target.latitude, target.longitude, airport.latitude, airport.longitude),
      bearing: initialBearing(target.latitude, target.longitude, airport.latitude, airport.longitude),
    }))
    .filter((item) => Number.isFinite(item.distanceKm) && item.distanceKm <= NEARBY_SEARCH_RADIUS_KM)
    .sort((a, b) => a.distanceKm - b.distanceKm || a.airport.icaoCode.localeCompare(b.airport.icaoCode))
    .slice(0, Math.min(NEARBY_AIRPORT_LIMIT, Math.max(1, Math.trunc(limit))));
}

/**
 * Returns nearby airports from the local database only. The bundled catalog
 * is an offline/demo fallback; no external request is made here.
 */
export async function getNearbyAirports(target: Airport, limit = NEARBY_AIRPORT_LIMIT): Promise<NearbyAirport[]> {
  const database = getPrisma();
  const radiusLat = latitudeDelta(NEARBY_SEARCH_RADIUS_KM);
  const radiusLon = longitudeDelta(NEARBY_SEARCH_RADIUS_KM, target.latitude);
  const minLat = Math.max(-90, target.latitude - radiusLat);
  const maxLat = Math.min(90, target.latitude + radiusLat);
  const minLon = Math.max(-180, target.longitude - radiusLon);
  const maxLon = Math.min(180, target.longitude + radiusLon);

  if (database) {
    try {
      const table = database.orm.public.Airport as unknown as NearbyAirportTable;
      const rows = await table
        .where((airport) => airport.latitude.gte(minLat))
        .where((airport) => airport.latitude.lte(maxLat))
        .where((airport) => airport.longitude.gte(minLon))
        .where((airport) => airport.longitude.lte(maxLon))
        .limit(NEARBY_CANDIDATE_LIMIT)
        .all();
      const airports = rows.flatMap((row) => {
        const airport = validAirport(row);
        return airport ? [airport] : [];
      });
      return toNearby(target, airports, limit);
    } catch {
      // The catalog is sufficient for demo/degraded airport detail.
    }
  }

  return toNearby(target, SAMPLE_AIRPORTS, limit);
}
