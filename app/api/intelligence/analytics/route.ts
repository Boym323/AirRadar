import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { getFlightIntelligenceAnalytics } from "@/lib/server/flight-intelligence-analytics";
import type { IntelligenceAnalyticsRange } from "@/lib/intelligence-analytics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseRange(value: string | null): IntelligenceAnalyticsRange {
  return value === "today" || value === "7d" || value === "30d" ? value : "7d";
}

export async function GET(request: Request): Promise<Response> {
  const rateLimit = checkPublicRateLimit("intelligence", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  const range = parseRange(new URL(request.url).searchParams.get("range"));
  const result = await getFlightIntelligenceAnalytics(range);
  return Response.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
