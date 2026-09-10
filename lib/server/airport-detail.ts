import type { Airport } from "@/lib/airports/types";
import { defaultAirportResolver, normalizeAirportIcao, type AirportResolverLike } from "@/lib/server/airport-resolver";
import { getAirportInfrastructure } from "@/lib/server/airport-infrastructure";
import type { AirportInfrastructure } from "@/lib/airports/infrastructure";

/** Resolve only canonical ICAO route params for the airport detail page. */
export async function resolveAirportDetail(
  rawIcao: unknown,
  resolver: AirportResolverLike = defaultAirportResolver,
): Promise<Airport | null> {
  const icaoCode = normalizeAirportIcao(rawIcao);
  if (!icaoCode) return null;
  const airport = await resolver.resolve({ icaoCode });
  return airport && normalizeAirportIcao(airport.icaoCode) === icaoCode ? airport : null;
}

export async function resolveAirportDetailWithInfrastructure(
  rawIcao: unknown,
  resolver: AirportResolverLike = defaultAirportResolver,
): Promise<{ airport: Airport; infrastructure: AirportInfrastructure } | null> {
  const airport = await resolveAirportDetail(rawIcao, resolver);
  if (!airport) return null;
  return { airport, infrastructure: await getAirportInfrastructure(airport) };
}
