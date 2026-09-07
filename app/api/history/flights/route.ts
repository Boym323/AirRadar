import { listHistoryFlights, HistoryDatabaseUnavailableError, normalizeHistoryRange } from "@/lib/server/history";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { normalizeIcaoHex } from "@/lib/server/validation";

export const dynamic = "force-dynamic";

function noStoreHeaders(): HeadersInit {
  return { "Cache-Control": "no-store" };
}

export async function GET(request: Request): Promise<Response> {
  const rateLimit = checkPublicRateLimit("history");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const url = new URL(request.url);
  const rawHex = url.searchParams.get("hex");
  const icaoHex = rawHex === null ? null : normalizeIcaoHex(rawHex);
  if (rawHex !== null && !icaoHex) {
    return Response.json({ error: "Invalid aircraft identifier" }, { status: 400, headers: noStoreHeaders() });
  }

  const rawLimit = url.searchParams.get("limit");
  const parsedLimit = rawLimit === null ? undefined : Number(rawLimit);
  if (parsedLimit !== undefined && (!Number.isSafeInteger(parsedLimit) || parsedLimit < 1)) {
    return Response.json({ error: "Invalid history limit" }, { status: 400, headers: noStoreHeaders() });
  }

  try {
    const result = await listHistoryFlights({
      range: normalizeHistoryRange(url.searchParams.get("range")),
      query: url.searchParams.get("q"),
      icaoHex,
      limit: parsedLimit,
    });
    return Response.json(result, { headers: noStoreHeaders() });
  } catch (error) {
    if (error instanceof HistoryDatabaseUnavailableError) {
      return Response.json({ error: "History is temporarily unavailable" }, { status: 503, headers: noStoreHeaders() });
    }
    return Response.json({ error: "History could not be loaded" }, { status: 500, headers: noStoreHeaders() });
  }
}
