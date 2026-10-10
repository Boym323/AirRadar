import { getWindModelComparison } from "@/lib/server/aladin-wind";
import { isWindLevel } from "@/lib/server/wind-aloft";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const limit = checkPublicRateLimit("mapContext", request);
  if (!limit.allowed) return rateLimitResponse(limit);
  if (process.env.ALADIN_WIND_ENABLED?.trim().toLowerCase() !== "true") {
    return Response.json({ enabled: false, available: false, notice: "Operator disabled" }, { headers: { "Cache-Control": "no-store" } });
  }
  const level = Number(new URL(request.url).searchParams.get("level") ?? "300");
  if (!isWindLevel(level)) return Response.json({ error: "Invalid pressure level" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const comparison = await getWindModelComparison(level);
  return Response.json({ enabled: true, ...comparison }, { headers: { "Cache-Control": "no-store" } });
}
