import { normalizeAirportTrafficRange, AirportTrafficDatabaseUnavailableError, getAirportTrafficSummary } from "@/lib/server/airport-traffic";
import { resolveAirportDetail } from "@/lib/server/airport-detail";
import { normalizeAirportIcao } from "@/lib/server/airport-resolver";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

function noStoreHeaders(): HeadersInit {
  return { "Cache-Control": "no-store" };
}

export async function GET(request: Request, context: { params: Promise<{ icao: string }> }): Promise<Response> {
  const rateLimit = checkPublicRateLimit("airportTraffic");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const { icao: rawIcao } = await context.params;
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawIcao);
  } catch {
    return Response.json({ error: "Invalid airport ICAO" }, { status: 400, headers: noStoreHeaders() });
  }
  const icao = normalizeAirportIcao(decoded);
  if (!icao) return Response.json({ error: "Invalid airport ICAO" }, { status: 400, headers: noStoreHeaders() });

  const rawRange = new URL(request.url).searchParams.get("range");
  if (rawRange !== null && rawRange !== "7d" && rawRange !== "30d") {
    return Response.json({ error: "Invalid airport traffic range" }, { status: 400, headers: noStoreHeaders() });
  }

  try {
    const airport = await resolveAirportDetail(icao);
    if (!airport) return Response.json({ error: "Airport not found" }, { status: 404, headers: noStoreHeaders() });
    const result = await getAirportTrafficSummary(airport, { range: normalizeAirportTrafficRange(rawRange) });
    return Response.json(result, { headers: noStoreHeaders() });
  } catch (error) {
    if (error instanceof AirportTrafficDatabaseUnavailableError) {
      return Response.json({ error: "Airport traffic is temporarily unavailable" }, { status: 503, headers: noStoreHeaders() });
    }
    return Response.json({ error: "Airport traffic could not be loaded" }, { status: 500, headers: noStoreHeaders() });
  }
}
