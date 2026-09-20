import { getAllSectorTrafficContext } from "@/lib/server/sector-traffic-context";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
export const dynamic = "force-dynamic";
export async function GET(request: Request): Promise<Response> { const rateLimit = checkPublicRateLimit("atcSectors", request); if (!rateLimit.allowed) return rateLimitResponse(rateLimit); const at = new URL(request.url).searchParams.get("at") ?? undefined; try { return Response.json({ at: at ? new Date(at).toISOString() : new Date().toISOString(), sectors: await getAllSectorTrafficContext(at) }); } catch { return Response.json({ error: "Invalid UTC timestamp" }, { status: 400 }); } }
