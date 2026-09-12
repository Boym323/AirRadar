import { defaultAirportResolver, normalizeAirportIcao, type AirportResolverLike } from "@/lib/server/airport-resolver";
import { defaultAviationWeatherProvider, type AviationWeatherProvider } from "@/lib/server/aviation-weather-provider";
import { isAviationWeatherEnabled } from "@/lib/server/config";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";

const WEATHER_SOURCE = "Aviation Weather Center" as const;
const MAX_BATCH_AIRPORTS = 8;

export interface WeatherRouteDependencies {
  airportResolver?: AirportResolverLike;
  weatherProvider?: Pick<AviationWeatherProvider, "getAirportWeather"> & Partial<Pick<AviationWeatherProvider, "getSigmets">>;
  enabled?: boolean;
}

function weatherEnabled(dependencies: WeatherRouteDependencies): boolean {
  if (dependencies.enabled !== undefined) return dependencies.enabled;
  if (dependencies.weatherProvider || dependencies.airportResolver) return true;
  return isAviationWeatherEnabled();
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function disabledResponse(): Response {
  return json({ enabled: false, available: false, source: WEATHER_SOURCE, metar: null, taf: null, stale: false });
}

function requestedIcaos(rawValue: unknown): string[] | null {
  if (typeof rawValue !== "string") return null;
  const rawParts = rawValue.split(",").map((value) => value.trim()).filter(Boolean);
  const values = rawParts.map((value) => normalizeAirportIcao(value));
  if (!rawParts.length || values.some((value) => value === null) || values.length > MAX_BATCH_AIRPORTS) return null;
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

export async function getWeatherAirportResponse(request: Request, rawIcao: unknown, dependencies: WeatherRouteDependencies = {}): Promise<Response> {
  if (!weatherEnabled(dependencies)) return disabledResponse();
  const rateLimit = checkPublicRateLimit("weather", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  const requestedIcao = normalizeAirportIcao(rawIcao);
  if (!requestedIcao) return json({ error: "Invalid airport ICAO" }, 400);

  const airportResolver = dependencies.airportResolver ?? defaultAirportResolver;
  let airport;
  try {
    airport = await airportResolver.resolve({ icaoCode: requestedIcao });
  } catch {
    return json({ error: "Weather data temporarily unavailable" }, 503);
  }
  const canonicalIcao = normalizeAirportIcao(airport?.icaoCode);
  if (!airport || !canonicalIcao) return json({ error: "Airport not found" }, 404);

  try {
    const provider = dependencies.weatherProvider ?? defaultAviationWeatherProvider;
    const weather = await provider.getAirportWeather(canonicalIcao, request.signal);
    return json({
      enabled: true,
      available: true,
      source: weather.source ?? WEATHER_SOURCE,
      airport: { ...airport, icaoCode: canonicalIcao },
      metar: weather.metar,
      taf: weather.taf,
      fetchedAt: weather.fetchedAt,
      stale: weather.stale,
      cacheSource: weather.cacheSource,
      snapshotAgeMs: weather.snapshotAgeMs,
    });
  } catch {
    return json({ error: "Weather data temporarily unavailable" }, 503);
  }
}

export async function getWeatherAirportsResponse(request: Request, rawIcaoList: unknown, dependencies: WeatherRouteDependencies = {}): Promise<Response> {
  if (!weatherEnabled(dependencies)) return json({ enabled: false, available: false, source: WEATHER_SOURCE, airports: [] });
  const rateLimit = checkPublicRateLimit("weather", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  const icaoCodes = requestedIcaos(rawIcaoList);
  if (!icaoCodes) return json({ error: "Invalid airport ICAO list" }, 400);

  const airportResolver = dependencies.airportResolver ?? defaultAirportResolver;
  const provider = dependencies.weatherProvider ?? defaultAviationWeatherProvider;
  const results = await Promise.all(icaoCodes.map(async (requestedIcao) => {
    try {
      const airport = await airportResolver.resolve({ icaoCode: requestedIcao });
      const canonicalIcao = normalizeAirportIcao(airport?.icaoCode);
      if (!airport || !canonicalIcao) return null;
      const weather = await provider.getAirportWeather(canonicalIcao, request.signal);
      return {
        enabled: true,
        available: true,
        source: weather.source ?? WEATHER_SOURCE,
        airport: { ...airport, icaoCode: canonicalIcao },
        metar: weather.metar,
        taf: weather.taf,
        fetchedAt: weather.fetchedAt,
        stale: weather.stale,
        cacheSource: weather.cacheSource,
        snapshotAgeMs: weather.snapshotAgeMs,
      };
    } catch {
      return null;
    }
  }));
  const airports = results.filter((result): result is NonNullable<typeof result> => result !== null);
  if (!airports.length) return json({ error: "Weather data temporarily unavailable" }, 503);
  return json({ enabled: true, available: true, source: WEATHER_SOURCE, airports });
}

export async function getSigmetResponse(request: Request, dependencies: WeatherRouteDependencies = {}): Promise<Response> {
  if (!weatherEnabled(dependencies)) return json({ enabled: false, available: false, source: WEATHER_SOURCE, type: "FeatureCollection", features: [], stale: false });
  const rateLimit = checkPublicRateLimit("weather", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  try {
    const provider = dependencies.weatherProvider ?? defaultAviationWeatherProvider;
    if (!provider.getSigmets) return json({ error: "SIGMET data temporarily unavailable" }, 503);
    const snapshot = await provider.getSigmets(request.signal);
    return json({ enabled: true, available: true, source: WEATHER_SOURCE, ...snapshot });
  } catch {
    return json({ error: "SIGMET data temporarily unavailable" }, 503);
  }
}
