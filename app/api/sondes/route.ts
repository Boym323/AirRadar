import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { defaultSondeHubProvider, isSondeHubEnabled } from "@/lib/server/sondehub-provider";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  if (!isSondeHubEnabled()) return Response.json({ enabled: false, available: false, stale: false, source: "SondeHub", fetchedAt: null, sondes: [] }, { headers: { "Cache-Control": "no-store" } });
  const limit = checkPublicRateLimit("mapContext", request);
  if (!limit.allowed) return rateLimitResponse(limit);
  const query = new URL(request.url).searchParams;
  const lat = Number(query.get("lat"));
  const lon = Number(query.get("lon"));
  const radiusKm = Number(query.get("radiusKm") ?? 200);
  if (query.get("lat") === null || query.get("lon") === null || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 ||
      !Number.isFinite(radiusKm) || radiusKm < 25 || radiusKm > 300) {
    return Response.json({ error: "Invalid SondeHub area" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json(await defaultSondeHubProvider.getSnapshot(lat, lon, radiusKm), { headers: { "Cache-Control": "no-store" } });
}
