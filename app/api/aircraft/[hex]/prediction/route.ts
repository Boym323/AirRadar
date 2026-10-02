import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { getPredictiveGraduationPolicy, toPublicPredictiveState } from "@/lib/predictive-intelligence";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { normalizeIcaoHex } from "@/lib/server/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ hex: string }> }): Promise<Response> {
  const rateLimit = checkPublicRateLimit("aircraft", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  const raw = (await context.params).hex;
  let decoded: string;
  try { decoded = decodeURIComponent(raw); } catch { return Response.json({ error: "Invalid aircraft identifier" }, { status: 400, headers: { "Cache-Control": "no-store" } }); }
  const hex = normalizeIcaoHex(decoded);
  if (!hex) return Response.json({ error: "Invalid aircraft identifier" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const service = getAircraftStateService();
  const prediction = toPublicPredictiveState(service.getPredictiveState(hex), getPredictiveGraduationPolicy());
  return Response.json({ prediction }, { headers: { "Cache-Control": "no-store" } });
}
