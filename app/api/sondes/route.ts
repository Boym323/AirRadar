import { getReceiverPosition } from "@/lib/server/config";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { defaultSondeHubProvider } from "@/lib/server/sondehub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const limit = checkPublicRateLimit("mapContext", request);
  if (!limit.allowed) return rateLimitResponse(limit);
  if (process.env.SONDEHUB_ENABLED?.trim().toLowerCase() !== "true") {
    return Response.json({ enabled: false, available: false, stale: false, count: 0, observations: [], source: "SondeHub" }, {
      headers: { "Cache-Control": "no-store" },
    });
  }
  const { lat, lon } = getReceiverPosition();
  const snapshot = await defaultSondeHubProvider.getSnapshot(lat, lon);
  return Response.json({ enabled: true, ...snapshot }, {
    headers: { "Cache-Control": "no-store" },
  });
}
