import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { defaultSondeHubProvider, isSondeHubEnabled } from "@/lib/server/sondehub-provider";
import { defaultSondeMqttReceiver, isSondeMqttEnabled } from "@/lib/server/sondehub-mqtt";

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
  if (isSondeMqttEnabled()) defaultSondeMqttReceiver.requestStart();
  const base = await defaultSondeHubProvider.getSnapshot(lat, lon, radiusKm);
  const live = isSondeMqttEnabled() ? defaultSondeMqttReceiver.getSnapshot(lat, lon, radiusKm) : null;
  const bySerial = new Map(base.sondes.map((item) => [item.serial, item]));
  for (const item of live?.sondes ?? []) {
    const existing = bySerial.get(item.serial);
    if (!existing || item.observedAt > existing.observedAt) bySerial.set(item.serial, item);
  }
  const sondes = [...bySerial.values()]
    .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))
    .slice(0, 100);
  return Response.json({
    ...base,
    available: base.available || Boolean(live?.sondes.length),
    stale: base.stale && !live?.connected,
    sondes,
    live: { enabled: isSondeMqttEnabled(), connected: live?.connected ?? false, observedAt: live?.observedAt ?? null },
  }, { headers: { "Cache-Control": "no-store" } });
}
