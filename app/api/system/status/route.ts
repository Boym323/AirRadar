import { readSystemStatus } from "@/lib/server/system-status";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const rateLimit = checkPublicRateLimit("systemStatus");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  try {
    return Response.json(await readSystemStatus(), {
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
