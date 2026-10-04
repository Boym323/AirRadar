import { getAircraftStateService } from "@/lib/server/aircraft-state";
import {
  buildAdminEtaAdvisoryPreview,
  buildAdminRunwayAdvisoryPreview,
  buildPublicEtaAdvisory,
  buildPublicRunwayAdvisory,
  getPredictiveGraduationPolicy,
  toPublicPredictiveState,
} from "@/lib/predictive-intelligence";
import {
  enforcePredictiveReadiness,
  readPredictiveReadinessReport,
} from "@/lib/server/predictive-readiness";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { normalizeIcaoHex } from "@/lib/server/validation";
import { isWatchlistSessionValid } from "@/lib/server/watchlist-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ hex: string }> }): Promise<Response> {
  const rateLimit = checkPublicRateLimit("aircraft", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const raw = (await context.params).hex;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return Response.json({ error: "Invalid aircraft identifier" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const hex = normalizeIcaoHex(decoded);
  if (!hex) return Response.json({ error: "Invalid aircraft identifier" }, { status: 400, headers: { "Cache-Control": "no-store" } });

  const service = getAircraftStateService();
  const predictionState = service.getPredictiveState(hex);
  const configuredPolicy = getPredictiveGraduationPolicy();
  const admin = isWatchlistSessionValid(request);
  const readinessRequired = admin || Object.values(configuredPolicy).some((status) => status === "PUBLIC");
  const readiness = readinessRequired ? await readPredictiveReadinessReport() : null;
  const effectivePolicy = readiness
    ? enforcePredictiveReadiness(configuredPolicy, {
      thresholdVersion: readiness.thresholds.version,
      capabilities: readiness.capabilities,
    })
    : configuredPolicy;

  const prediction = toPublicPredictiveState(predictionState, effectivePolicy);
  const etaReadiness = readiness?.capabilities.ETA ?? null;
  const runwayReadiness = readiness?.capabilities.RUNWAY ?? null;
  const etaAdvisory = buildPublicEtaAdvisory(predictionState, effectivePolicy, etaReadiness);
  const runwayAdvisory = buildPublicRunwayAdvisory(predictionState, effectivePolicy, runwayReadiness);
  const adminPreview = admin && etaReadiness
    ? buildAdminEtaAdvisoryPreview(predictionState, configuredPolicy, etaReadiness)
    : undefined;
  const runwayAdminPreview = admin && runwayReadiness
    ? buildAdminRunwayAdvisoryPreview(predictionState, configuredPolicy, runwayReadiness)
    : undefined;

  return Response.json(
    {
      prediction,
      etaAdvisory,
      runwayAdvisory,
      ...(adminPreview ? { adminPreview } : {}),
      ...(runwayAdminPreview ? { runwayAdminPreview } : {}),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
