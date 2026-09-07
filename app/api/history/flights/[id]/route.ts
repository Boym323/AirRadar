import { getHistoryFlight, HistoryDatabaseUnavailableError } from "@/lib/server/history";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

function noStoreHeaders(): HeadersInit {
  return { "Cache-Control": "no-store" };
}

function parseFlightId(value: string): number | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (!/^[1-9]\d*$/.test(decoded)) return null;
  const id = Number(decoded);
  return Number.isSafeInteger(id) && id <= 2_147_483_647 ? id : null;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const rateLimit = checkPublicRateLimit("history");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const { id: rawId } = await context.params;
  const id = parseFlightId(rawId);
  if (id === null) {
    return Response.json({ error: "Invalid flight identifier" }, { status: 400, headers: noStoreHeaders() });
  }

  try {
    const flight = await getHistoryFlight(id);
    if (!flight) return Response.json({ error: "Flight not found" }, { status: 404, headers: noStoreHeaders() });
    return Response.json(flight, { headers: noStoreHeaders() });
  } catch (error) {
    if (error instanceof HistoryDatabaseUnavailableError) {
      return Response.json({ error: "History is temporarily unavailable" }, { status: 503, headers: noStoreHeaders() });
    }
    return Response.json({ error: "History could not be loaded" }, { status: 500, headers: noStoreHeaders() });
  }
}
