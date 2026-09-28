import { getAirportInfrastructure } from "@/lib/server/airport-infrastructure";
import { resolveAirportDetail } from "@/lib/server/airport-detail";
import { getAirportMovements, AirportMovementsDatabaseUnavailableError } from "@/lib/server/airport-movements";
import { buildAirportOperations } from "@/lib/server/airport-operations";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ icao: string }> }): Promise<Response> {
  const rateLimit = checkPublicRateLimit("airportMovements", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  const { icao } = await params;
  const airport = await resolveAirportDetail(icao);
  if (!airport) return Response.json({ error: "Airport not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const query = new URL(request.url).searchParams;
  const period = query.get("period");
  if (period !== null && !["today", "24h", "7d"].includes(period)) return Response.json({ error: "Invalid period" }, { status: 400 });
  try {
    const infrastructure = await getAirportInfrastructure(airport);
    const movements = await getAirportMovements(airport, infrastructure, { period });
    return Response.json(buildAirportOperations(movements, infrastructure.runways), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AirportMovementsDatabaseUnavailableError) return Response.json({ error: "Airport operations unavailable" }, { status: 503 });
    return Response.json({ error: "Airport operations unavailable" }, { status: 503 });
  }
}
