import { defaultMapContextArchive, validateMapContextAt } from "@/lib/server/map-context";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { getAtcData } from "@/lib/server/providers";
import { canonicalAirspaceDesignator } from "@/lib/airspace-activity/map";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const limited = checkPublicRateLimit("mapContext", request);
  if (!limited.allowed) return rateLimitResponse(limited);
  try {
    const at = validateMapContextAt(new URL(request.url).searchParams.get("at"));
    const resolved = await defaultMapContextArchive.resolveAupAt(at);
    if (!resolved.available || !resolved.data) return Response.json(resolved, { headers: { "Cache-Control": "no-store" } });
    const active = new Set(resolved.data.windows.map((window) => canonicalAirspaceDesignator(window.canonicalDesignator || window.designator)).filter((value): value is string => Boolean(value)));
    const atc = await getAtcData().catch(() => null);
    const sectors = atc?.sectors.filter((sector) => active.has(canonicalAirspaceDesignator(sector.id) ?? "") || active.has(canonicalAirspaceDesignator(sector.name) ?? "")).map((sector) => ({ id: sector.id, name: sector.name, polygons: sector.polygons })) ?? [];
    return Response.json({ ...resolved, data: { windows: resolved.data.windows, sectors } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Historical AUP/UUP unavailable" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
