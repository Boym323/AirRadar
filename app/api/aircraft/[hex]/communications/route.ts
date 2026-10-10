import { getRxwHubService } from "@/lib/server/rxw-hub-service";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { normalizeIcaoHex } from "@/lib/server/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request, context: { params: Promise<{ hex: string }> }): Promise<Response> {
  const rate = checkPublicRateLimit("aircraft", request);
  if (!rate.allowed) return rateLimitResponse(rate);

  const { hex } = await context.params;
  const normalized = normalizeIcaoHex(hex);
  // A readsb '~' address is not an ICAO24 identity.
  if (!normalized || normalized.startsWith("~")) {
    return Response.json({ error: "Invalid ICAO24 identifier" }, { status: 400, headers });
  }

  const hub = getRxwHubService();
  hub.start();
  return Response.json(hub.getSnapshot(normalized), { headers });
}
