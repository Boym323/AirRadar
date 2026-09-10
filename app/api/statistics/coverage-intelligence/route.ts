import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { getCoverageIntelligence } from "@/lib/server/statistics-coverage-intelligence";
import { parseCoverageIntelligenceRange } from "@/lib/statistics-coverage-intelligence";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS: HeadersInit = { "Cache-Control": "no-store" };

export async function GET(request: Request): Promise<Response> {
  const rateLimit = checkPublicRateLimit("statistics", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const range = parseCoverageIntelligenceRange(new URL(request.url).searchParams.get("range"));
  if (!range) {
    return Response.json({ error: "Invalid coverage intelligence range" }, { status: 400, headers: NO_STORE_HEADERS });
  }

  return Response.json(await getCoverageIntelligence(range), { headers: NO_STORE_HEADERS });
}
