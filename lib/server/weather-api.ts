import { defaultAirportResolver, normalizeAirportIcao, type AirportResolverLike } from "@/lib/server/airport-resolver";
import { defaultAviationWeatherProvider, type AviationWeatherProvider } from "@/lib/server/aviation-weather-provider";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";

export interface WeatherRouteDependencies {
  airportResolver?: AirportResolverLike;
  weatherProvider?: Pick<AviationWeatherProvider, "getAirportWeather">;
}

export async function getWeatherAirportResponse(
  request: Request,
  rawIcao: unknown,
  dependencies: WeatherRouteDependencies = {},
): Promise<Response> {
  const rateLimit = checkPublicRateLimit("weather", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const requestedIcao = normalizeAirportIcao(rawIcao);
  if (!requestedIcao) {
    return Response.json({ error: "Invalid airport ICAO" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const airportResolver = dependencies.airportResolver ?? defaultAirportResolver;
  const airport = await airportResolver.resolve({ icaoCode: requestedIcao });
  const canonicalIcao = normalizeAirportIcao(airport?.icaoCode);
  if (!airport || !canonicalIcao) {
    return Response.json({ error: "Airport not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const provider = dependencies.weatherProvider ?? defaultAviationWeatherProvider;
    const weather = await provider.getAirportWeather(canonicalIcao, request.signal);
    return Response.json({
      airport: { ...airport, icaoCode: canonicalIcao },
      metar: weather.metar,
      taf: weather.taf,
      fetchedAt: weather.fetchedAt,
      stale: weather.stale,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Weather data temporarily unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
