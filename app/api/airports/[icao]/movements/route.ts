import { getAirportInfrastructure } from "@/lib/server/airport-infrastructure";
import { resolveAirportDetail } from "@/lib/server/airport-detail";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { getAirportMovements, AirportMovementsDatabaseUnavailableError } from "@/lib/server/airport-movements";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ icao: string }> },
): Promise<Response> {
  const rateLimit = checkPublicRateLimit("airportMovements", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  const { icao } = await params;
  const airport = await resolveAirportDetail(icao);
  if (!airport) return Response.json({ error: "Airport not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const period = new URL(request.url).searchParams.get("period");
  if (period !== null && !["today", "24h", "7d"].includes(period)) return Response.json({ error: "Invalid period" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  try {
    const infrastructure = await getAirportInfrastructure(airport);
    return Response.json(await getAirportMovements(airport, infrastructure, { period }), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof AirportMovementsDatabaseUnavailableError) return Response.json({ error: "Airport movements unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    return Response.json({ error: "Airport movements unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
