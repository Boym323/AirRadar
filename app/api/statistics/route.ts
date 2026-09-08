import { getAircraftStateService } from "@/lib/server/aircraft-state";
import type { ReceiverStatisticsRange } from "@/lib/aircraft/types";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { StatisticsRangeDatabaseUnavailableError } from "@/lib/server/statistics-range";

export const dynamic = "force-dynamic";

function noStoreHeaders(): HeadersInit {
  return { "Cache-Control": "no-store" };
}

function parseRange(value: string | null): ReceiverStatisticsRange | null {
  return value === "7d" || value === "30d" ? value : null;
}

export async function GET(request: Request): Promise<Response> {
  const rateLimit = checkPublicRateLimit("statistics");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const service = getAircraftStateService();
  await service.waitForReady();
  const requestedRange = new URL(request.url).searchParams.get("range");
  if (requestedRange === null || requestedRange === "today") {
    return Response.json(service.getStatistics(), { headers: noStoreHeaders() });
  }

  const range = parseRange(requestedRange);
  if (!range) {
    return Response.json({ error: "Invalid statistics range" }, { status: 400, headers: noStoreHeaders() });
  }

  try {
    return Response.json(await service.getStatisticsRange(range), { headers: noStoreHeaders() });
  } catch (error) {
    if (error instanceof StatisticsRangeDatabaseUnavailableError) {
      return Response.json({ error: "Statistics range is temporarily unavailable" }, { status: 503, headers: noStoreHeaders() });
    }
    return Response.json({ error: "Statistics range could not be loaded" }, { status: 500, headers: noStoreHeaders() });
  }
}
