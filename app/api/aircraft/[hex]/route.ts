import { getAircraftDetail, HistoryDatabaseUnavailableError, normalizeAircraftHistoryRange } from "@/lib/server/history";
import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { normalizeIcaoHex } from "@/lib/server/validation";

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
    const range = normalizeAircraftHistoryRange(new URL(request.url).searchParams.get("range"));
    const detail = await getAircraftDetail(icaoHex, { historyRange: range });
    const liveEnrichment = getAircraftStateService().getAircraft(icaoHex)?.enrichment;
    return Response.json({ ...detail, ...(liveEnrichment ? { liveEnrichment } : {}) }, { headers: noStoreHeaders() });
  } catch (error) {
    if (error instanceof HistoryDatabaseUnavailableError) {
      return Response.json({ error: "Aircraft history is temporarily unavailable" }, { status: 503, headers: noStoreHeaders() });
    }
    return Response.json({ error: "Aircraft detail could not be loaded" }, { status: 500, headers: noStoreHeaders() });
  }
}
