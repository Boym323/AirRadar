import { getNavigationIntegrityService } from "@/lib/server/navigation-integrity";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const WINDOWS = new Set(["5m", "15m", "30m", "60m"]);

export async function GET(request: Request): Promise<Response> {
  const rateLimit = checkPublicRateLimit("aircraft", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  const params = new URL(request.url).searchParams;
  const window = params.get("window") ?? "15m";
  if (!WINDOWS.has(window)) return Response.json({ error: "Invalid navigation integrity window" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const minAltitude = params.get("minAltitude");
  const maxAltitude = params.get("maxAltitude");
  if (minAltitude !== null && (!/^\d{1,6}$/.test(minAltitude) || Number(minAltitude) > 200_000)) return Response.json({ error: "Invalid minimum altitude" }, { status: 400 });
  if (maxAltitude !== null && (!/^\d{1,6}$/.test(maxAltitude) || Number(maxAltitude) > 200_000)) return Response.json({ error: "Invalid maximum altitude" }, { status: 400 });
  if (minAltitude !== null && maxAltitude !== null && Number(minAltitude) > Number(maxAltitude)) return Response.json({ error: "Invalid altitude range" }, { status: 400 });
  const source = params.get("source");
  if (source !== null && source !== "LOCAL" && source !== "NETWORK") return Response.json({ error: "Invalid navigation integrity source" }, { status: 400 });
  const response = getNavigationIntegrityService().getCurrent(window as "5m" | "15m" | "30m" | "60m", new Date(), {
    minAltitudeFt: minAltitude === null ? undefined : Number(minAltitude),
    maxAltitudeFt: maxAltitude === null ? undefined : Number(maxAltitude),
    source: source === null ? undefined : source,
  });
  return Response.json(response, { headers: { "Cache-Control": "no-store" } });
}
