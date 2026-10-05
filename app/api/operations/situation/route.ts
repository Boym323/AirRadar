import { buildOperationalAttention } from "@/lib/operational-twin/operational-attention";
import { buildRegionalSituationGraph } from "@/lib/operational-twin/regional-situation";
import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const rateLimit = checkPublicRateLimit("aircraft", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const snapshot = getAircraftStateService().getSnapshot({
    coverage: "local",
    includeTrails: false,
  });
  const graph = buildRegionalSituationGraph(snapshot.aircraft, new Date());
  const attention = buildOperationalAttention(graph);

  return Response.json({ ...graph, attention }, {
    headers: { "Cache-Control": "no-store" },
  });
}
