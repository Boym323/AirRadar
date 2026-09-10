import { resolveAirportDetailWithInfrastructure } from "@/lib/server/airport-detail";
import { normalizeAirportIcao } from "@/lib/server/airport-resolver";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ icao: string }> }): Promise<Response> {
  const rateLimit = checkPublicRateLimit("airportDetail", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  const { icao } = await context.params;
  const canonical = normalizeAirportIcao(icao);
  if (!canonical) return Response.json({ error: "Airport not found" }, { status: 404 });
  const detail = await resolveAirportDetailWithInfrastructure(canonical);
  if (!detail) return Response.json({ error: "Airport not found" }, { status: 404 });
  return Response.json(detail, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } });
}
