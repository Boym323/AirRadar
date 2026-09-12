import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { inputFromAircraft, computeAtcContext, loadAtcContextDataset } from "@/lib/atc-context/engine";
import { normalizeIcaoHex } from "@/lib/server/validation";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ hex: string }> }): Promise<Response> {
  const rateLimit = checkPublicRateLimit("aircraft", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  let decoded: string;
  try { decoded = decodeURIComponent((await context.params).hex); } catch { return Response.json({ error: "Invalid aircraft identifier" }, { status: 400 }); }
  const hex = normalizeIcaoHex(decoded);
  if (!hex) return Response.json({ error: "Invalid aircraft identifier" }, { status: 400 });
  const aircraft = getAircraftStateService().getAircraft(hex);
  const input = aircraft ? inputFromAircraft(aircraft) : null;
  if (!aircraft || !input) return Response.json({ status: "unavailable", reason: "Aircraft has no valid live position" }, { headers: { "Cache-Control": "no-store" } });
  const observed = Date.parse(aircraft.lastSeen);
  if (!Number.isFinite(observed) || Date.now() - observed > 60_000 || (aircraft.seenPosSeconds !== null && aircraft.seenPosSeconds > 60)) return Response.json({ status: "stale", reason: "Aircraft position is older than 60 seconds" }, { headers: { "Cache-Control": "no-store" } });
  try {
    const dataset = await loadAtcContextDataset();
    if (!dataset) return Response.json({ status: "unavailable", reason: "ATC/ATS dataset unavailable" }, { headers: { "Cache-Control": "no-store" } });
    return Response.json(computeAtcContext(input, dataset), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("AirRadar ATC context unavailable", error);
    return Response.json({ status: "degraded", reason: "ATC/ATS context could not be computed" }, { headers: { "Cache-Control": "no-store" } });
  }
}
