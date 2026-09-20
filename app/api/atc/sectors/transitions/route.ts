import { getSectorTransitions } from "@/lib/server/sector-traffic-context";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
export const dynamic = "force-dynamic";
export async function GET(request: Request): Promise<Response> {
  const rateLimit = checkPublicRateLimit("atcSectors", request); if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  const params = new URL(request.url).searchParams; const rawWindow = params.get("window") ?? "5m"; const match = /^(1|5|15)m$/.exec(rawWindow);
  if (!match) return Response.json({ error: "window must be 1m, 5m or 15m" }, { status: 400 });
  try { return Response.json(await getSectorTransitions({ at: params.get("at") ?? undefined, windowMinutes: Number(match[1]) as 1 | 5 | 15 })); }
  catch { return Response.json({ error: "Invalid UTC timestamp" }, { status: 400 }); }
}
