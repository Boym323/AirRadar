import { getAircraftDetail, getAircraftQuickDetail, HistoryDatabaseUnavailableError, normalizeAircraftHistoryRange } from "@/lib/server/history";
import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { getOnDemandEnrichmentService } from "@/lib/server/providers";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { normalizeIcaoHex } from "@/lib/server/validation";
import { parseCoverage } from "@/lib/server/coverage";
import { getNavigationIntegrityService } from "@/lib/server/navigation-integrity";

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
    const mode = searchParams.get("mode");
    if (mode !== null && mode !== "quick" && mode !== "full" && mode !== "flightaware") {
      return Response.json({ error: "Invalid aircraft detail mode" }, { status: 400, headers: noStoreHeaders() });
    }
    const range = normalizeAircraftHistoryRange(searchParams.get("range"));
    const coverage = parseCoverage(searchParams.get("coverage"));
    const stateService = getAircraftStateService();
    const liveAircraft = stateService.getAircraft(icaoHex, coverage);

    // Explicit request only: never bill AeroAPI for quick/full detail or SSR.
    if (mode === "flightaware") {
      const service = getOnDemandEnrichmentService();
      if (!service.hasFlightPlanProvider) return Response.json({ flightPlan: null }, { status: 503, headers: noStoreHeaders() });
      const flightPlan = liveAircraft ? await service.getFlightPlanOnDemand(liveAircraft, new Date()) : null;
      return Response.json({ flightPlan }, { headers: noStoreHeaders() });
    }

    if (mode === "quick") {
      const quickDetail = await getAircraftQuickDetail(icaoHex, liveAircraft);
      const navigationIntegrity = getNavigationIntegrityService().getAircraft(icaoHex);
      return Response.json({ ...quickDetail, ...(navigationIntegrity.latest || navigationIntegrity.regionalContext.anomaly ? { navigationIntegrity } : {}) }, { headers: noStoreHeaders() });
    }

    const detail = await getAircraftDetail(icaoHex, { historyRange: range });
    const liveEnrichment = liveAircraft?.enrichment;

    const navigationIntegrity = getNavigationIntegrityService().getAircraft(icaoHex);
    return Response.json({ ...detail, ...(liveEnrichment ? { liveEnrichment } : {}), ...(navigationIntegrity.latest || navigationIntegrity.regionalContext.anomaly ? { navigationIntegrity } : {}) }, { headers: noStoreHeaders() });
  } catch (error) {
    if (error instanceof HistoryDatabaseUnavailableError) {
      return Response.json({ error: "Aircraft history is temporarily unavailable" }, { status: 503, headers: noStoreHeaders() });
    }
    return Response.json({ error: "Aircraft detail could not be loaded" }, { status: 500, headers: noStoreHeaders() });
  }
}
