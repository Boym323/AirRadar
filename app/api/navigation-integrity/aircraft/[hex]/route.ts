import { getNavigationIntegrityService } from "@/lib/server/navigation-integrity";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { normalizeIcaoHex } from "@/lib/server/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ hex: string }> }): Promise<Response> {
  const rateLimit = checkPublicRateLimit("aircraft", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  let raw: string;
  try {
    raw = decodeURIComponent((await context.params).hex);
  } catch {
    return Response.json({ error: "Invalid aircraft identifier" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const hex = normalizeIcaoHex(raw);
  if (!hex) return Response.json({ error: "Invalid aircraft identifier" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  return Response.json({ aircraft: getNavigationIntegrityService().getAircraft(hex) }, { headers: { "Cache-Control": "no-store" } });
}
