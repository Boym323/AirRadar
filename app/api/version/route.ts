import { getPublicVersion } from "@/lib/server/version";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const rateLimit = checkPublicRateLimit("version", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  return Response.json(getPublicVersion(), {
    headers: { "Cache-Control": "no-store" },
  });
}
