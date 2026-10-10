import { getRxwHubService } from "@/lib/server/rxw-hub-service";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** One bounded summary for the radar, not one request per aircraft. */
export async function GET(request: Request): Promise<Response> {
  const rate = checkPublicRateLimit("aircraft", request);
  if (!rate.allowed) return rateLimitResponse(rate);
  const hub = getRxwHubService();
  hub.start();
  return Response.json(hub.getWaypointAvailability(), { headers: { "Cache-Control": "no-store" } });
}
