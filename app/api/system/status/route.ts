import { readSystemStatus, toAdminSystemStatus, toPublicSystemStatus } from "@/lib/server/system-status";
import { isWatchlistAdminSessionValid } from "@/lib/server/watchlist-auth";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const rateLimit = checkPublicRateLimit("systemStatus", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  try {
    const admin = isWatchlistAdminSessionValid(request);
    const status = await readSystemStatus(undefined, admin ? "full" : "public");
    const response = admin ? toAdminSystemStatus(status) : toPublicSystemStatus(status);
    return Response.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    // Keep failures bounded and free of provider, ORM or environment details.
    return Response.json({ error: "System status unavailable" }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
