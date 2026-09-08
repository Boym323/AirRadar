import type { Airport } from "@/lib/airports/types";
import { defaultAirportResolver, normalizeAirportIcao, type AirportResolverLike } from "@/lib/server/airport-resolver";

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
