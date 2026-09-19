import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { inputFromAircraft, computeAtcContext, loadAtcContextDataset } from "@/lib/atc-context/engine";
import { normalizeIcaoHex } from "@/lib/server/validation";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { classifyAtcPrediction, getAtcPredictionValidation } from "@/lib/server/atc-prediction-validation";

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
  const validation = getAtcPredictionValidation();
  if (!aircraft || !input) {
    validation.observePrediction({ hex, currentSector: aircraft?.atc?.sectorId ?? null, predictedSector: null, predictedEtaSeconds: null, suppressionReason: "invalid_position" });
    return Response.json({ status: "unavailable", reason: "Aircraft has no valid live position" }, { headers: { "Cache-Control": "no-store" } });
  }
  const observed = Date.parse(aircraft.lastSeen);
  if (!Number.isFinite(observed) || Date.now() - observed > 60_000 || (aircraft.seenPosSeconds !== null && aircraft.seenPosSeconds > 60)) {
    validation.observePrediction({ hex, currentSector: aircraft.atc?.sectorId ?? null, predictedSector: null, predictedEtaSeconds: null, suppressionReason: "stale" });
    return Response.json({ status: "stale", reason: "Aircraft position is older than 60 seconds" }, { headers: { "Cache-Control": "no-store" } });
  }
  try {
    const dataset = await loadAtcContextDataset();
    if (!dataset) return Response.json({ status: "unavailable", reason: "ATC/ATS dataset unavailable" }, { headers: { "Cache-Control": "no-store" } });
    const result = computeAtcContext(input, dataset);
    const reason = classifyAtcPrediction({
      currentSector: validation.getCurrentSector(hex) ?? aircraft.atc?.sectorId ?? null,
      hasNextSector: result.nextSector !== null,
      onGround: aircraft.onGround,
      observedAtMs: observed,
      seenPosSeconds: aircraft.seenPosSeconds,
      nowMs: Date.now(),
      lat: aircraft.lat,
      lon: aircraft.lon,
      track: aircraft.track,
      groundSpeed: aircraft.groundSpeed,
      currentAirspaces: result.currentAirspaces.length,
    });
    validation.observePrediction({ hex, currentSector: validation.getCurrentSector(hex) ?? aircraft.atc?.sectorId ?? null, predictedSector: result.nextSector?.airspace.id ?? null, predictedEtaSeconds: result.nextSector?.estimatedSeconds ?? null, suppressionReason: reason });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("AirRadar ATC context unavailable", error);
    return Response.json({ status: "degraded", reason: "ATC/ATS context could not be computed" }, { headers: { "Cache-Control": "no-store" } });
  }
}
