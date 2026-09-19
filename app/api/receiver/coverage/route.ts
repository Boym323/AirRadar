import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { getHistoricalReceiverCoverage, type CoveragePeriod } from "@/lib/server/receiver-coverage-analytics";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const limit = checkPublicRateLimit("statistics", request);
  if (!limit.allowed) return rateLimitResponse(limit);
  const period = new URL(request.url).searchParams.get("period") as CoveragePeriod | null;
  if (period !== "live" && period !== "today" && period !== "7d" && period !== "30d") return Response.json({ error: "Invalid coverage period" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  try {
    const service = getAircraftStateService(); await service.waitForReady();
    const response = period === "live" ? service.getLiveReceiverCoverage() : await getHistoricalReceiverCoverage(period);
    return Response.json(response, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Receiver coverage is temporarily unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
