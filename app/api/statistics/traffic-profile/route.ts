import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { getStatisticsTrafficProfile } from "@/lib/server/statistics-traffic-profile";
import { parseTrafficProfileRange } from "@/lib/statistics-traffic-profile";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const rateLimit = checkPublicRateLimit("statistics", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const range = parseTrafficProfileRange(new URL(request.url).searchParams.get("range"));
  if (!range) {
    return Response.json(
      { error: "Invalid traffic profile range" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  return Response.json(
    await getStatisticsTrafficProfile(range),
    { headers: NO_STORE_HEADERS },
  );
}
