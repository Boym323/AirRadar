import { buildOperationalAttention } from "@/lib/operational-twin/operational-attention";
import { buildRegionalSituationGraph } from "@/lib/operational-twin/regional-situation";
import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const rateLimit = checkPublicRateLimit("aircraft", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const service = getAircraftStateService();
  const snapshot = service.getSnapshot({
    coverage: "local",
    includeTrails: false,
  });
  const generatedAt = new Date();
  const graph = buildRegionalSituationGraph(snapshot.aircraft, generatedAt);
  const attention = buildOperationalAttention(graph);
  service.captureRegionalAttentionOutcome(attention);
  const graduation = service.getRegionalAttentionGraduationReport(generatedAt);
  const attentionGraduation = {
    version: graduation.version,
    decision: graduation.decision,
    graduated: graduation.decision === "PASS" && graduation.manualPromotionEligible,
    scope: graduation.scope,
  };

  return Response.json({ ...graph, attention, attentionGraduation }, {
    headers: { "Cache-Control": "no-store" },
  });
}
