import { AIRCRAFT_WEATHER_LIMITS, queryAircraftWeatherObservations, type AircraftWeatherSource } from "@/lib/server/aircraft-weather";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const noStore = (data: unknown, status = 200): Response => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
function number(value: string | null): number | undefined { if (value === null || value.trim() === "") return undefined; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : undefined; }
function hasInvalidNumber(url: URL, key: string): boolean {
  const value = url.searchParams.get(key);
  return value !== null && (value.trim() === "" || !Number.isFinite(Number(value)));
}
function iso(value: Date): string { return value.toISOString(); }

export async function GET(request: Request): Promise<Response> {
  const rateLimit = checkPublicRateLimit("weather", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  const url = new URL(request.url);
  const now = new Date();
  const to = new Date(url.searchParams.get("to") ?? now.toISOString());
  const from = new Date(url.searchParams.get("from") ?? new Date(now.getTime() - AIRCRAFT_WEATHER_LIMITS.defaultWindowMs).toISOString());
  const lat = number(url.searchParams.get("lat"));
  const lon = number(url.searchParams.get("lon"));
  const radiusKm = number(url.searchParams.get("radiusKm")) ?? 50;
  const minAltitude = number(url.searchParams.get("minAltitude"));
  const maxAltitude = number(url.searchParams.get("maxAltitude"));
  const source = url.searchParams.get("source") as AircraftWeatherSource | null;
  const limit = number(url.searchParams.get("limit")) ?? 500;
  const offset = number(url.searchParams.get("offset")) ?? 0;
  const invalidNumericParameter = ["lat", "lon", "radiusKm", "minAltitude", "maxAltitude", "limit", "offset"].some((key) => hasInvalidNumber(url, key));
  if (invalidNumericParameter || !Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to || to.getTime() - from.getTime() > AIRCRAFT_WEATHER_LIMITS.maxQueryWindowMs
    || (lat !== undefined && (lat < -90 || lat > 90)) || (lon !== undefined && (lon < -180 || lon > 180)) || ((lat === undefined) !== (lon === undefined))
    || radiusKm <= 0 || radiusKm > AIRCRAFT_WEATHER_LIMITS.maxRadiusKm || !Number.isInteger(limit) || limit < 1 || limit > AIRCRAFT_WEATHER_LIMITS.maxRows || !Number.isInteger(offset) || offset < 0
    || (minAltitude !== undefined && maxAltitude !== undefined && minAltitude > maxAltitude)
    || (source !== null && !["BDS_4_4", "READSB_JSON", "DERIVED", "UNKNOWN"].includes(source))) return noStore({ error: "Invalid aircraft weather query" }, 400);
  try {
    const result = await queryAircraftWeatherObservations({ from, to, lat, lon, radiusKm, minAltitude, maxAltitude, source: source ?? undefined, limit, offset });
    return noStore({ generatedAt: now.toISOString(), query: { from: iso(from), to: iso(to), lat: lat ?? null, lon: lon ?? null, radiusKm, minAltitude: minAltitude ?? null, maxAltitude: maxAltitude ?? null, source: source ?? null, limit, offset }, source: result.source, totalApproximate: result.totalApproximate, observations: result.observations.map((row) => ({ ...row, observedAt: row.observedAt.toISOString(), receivedAt: row.receivedAt?.toISOString() ?? null })) });
  } catch {
    return noStore({ error: "Aircraft weather observations temporarily unavailable" }, 503);
  }
}
