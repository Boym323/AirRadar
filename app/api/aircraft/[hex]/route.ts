import { getAircraftDetail, HistoryDatabaseUnavailableError, normalizeAircraftHistoryRange } from "@/lib/server/history";
import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { getOnDemandEnrichmentService } from "@/lib/server/providers";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { normalizeIcaoHex } from "@/lib/server/validation";
import { parseCoverage } from "@/lib/server/coverage";

export const dynamic = "force-dynamic";

function noStoreHeaders(): HeadersInit {
  return { "Cache-Control": "no-store" };
}

export async function GET(request: Request, context: { params: Promise<{ hex: string }> }): Promise<Response> {
  const rateLimit = checkPublicRateLimit("aircraft", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const { hex: rawHex } = await context.params;
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawHex);
  } catch {
    return Response.json({ error: "Invalid aircraft identifier" }, { status: 400, headers: noStoreHeaders() });
  }
  const icaoHex = normalizeIcaoHex(decoded);
  if (!icaoHex) {
    return Response.json({ error: "Invalid aircraft identifier" }, { status: 400, headers: noStoreHeaders() });
  }

  try {
    const searchParams = new URL(request.url).searchParams;
    const range = normalizeAircraftHistoryRange(searchParams.get("range"));
    const coverage = parseCoverage(searchParams.get("coverage"));
    const stateService = getAircraftStateService();
    const liveAircraft = stateService.getAircraft(icaoHex, coverage);

    // FlightAware is deliberately detail/on-demand only. The shared service
    // provides process-wide cache and cost budget, while failures remain
    // fail-soft so aircraft history/detail never depends on the paid provider.
    const [detail, flightPlan] = await Promise.all([
      getAircraftDetail(icaoHex, { historyRange: range }),
      liveAircraft
        ? getOnDemandEnrichmentService().getFlightPlanOnDemand(liveAircraft, new Date())
        : Promise.resolve(null),
    ]);

    const liveEnrichment = liveAircraft?.enrichment || flightPlan
      ? {
          ...(liveAircraft?.enrichment ?? {}),
          ...(flightPlan ? { flightPlan } : {}),
        }
      : undefined;

    return Response.json({ ...detail, ...(liveEnrichment ? { liveEnrichment } : {}) }, { headers: noStoreHeaders() });
  } catch (error) {
    if (error instanceof HistoryDatabaseUnavailableError) {
      return Response.json({ error: "Aircraft history is temporarily unavailable" }, { status: 503, headers: noStoreHeaders() });
    }
    return Response.json({ error: "Aircraft detail could not be loaded" }, { status: 500, headers: noStoreHeaders() });
  }
}
