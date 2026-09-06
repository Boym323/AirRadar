import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { getAircraftHistory } from "@/lib/server/history";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { normalizeIcaoHex } from "@/lib/server/validation";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ hex: string }> }): Promise<Response> {
  const { hex } = await context.params;
  const rateLimit = checkPublicRateLimit("history");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  let decodedHex: string;
  try {
    decodedHex = decodeURIComponent(hex);
  } catch {
    return Response.json({ error: "Invalid aircraft identifier" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const normalizedHex = normalizeIcaoHex(decodedHex);
  if (!normalizedHex) {
    return Response.json({ error: "Invalid aircraft identifier" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const service = getAircraftStateService();
  await service.waitForReady();
  const current = service.getAircraft(normalizedHex);
  const history = await getAircraftHistory(normalizedHex, current);
  return Response.json({ icaoHex: normalizedHex, ...history }, { headers: { "Cache-Control": "no-store" } });
}
