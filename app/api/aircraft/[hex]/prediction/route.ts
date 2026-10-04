import { getAircraftStateService } from "@/lib/server/aircraft-state";
import {
  buildAdminEtaAdvisoryPreview,
  buildPublicEtaAdvisory,
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
  const etaAdvisory = buildPublicEtaAdvisory(predictionState, effectivePolicy, etaReadiness);
  const adminPreview = admin && etaReadiness
    ? buildAdminEtaAdvisoryPreview(predictionState, configuredPolicy, etaReadiness)
    : undefined;

  return Response.json(
    {
      prediction,
      etaAdvisory,
      ...(adminPreview ? { adminPreview } : {}),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
