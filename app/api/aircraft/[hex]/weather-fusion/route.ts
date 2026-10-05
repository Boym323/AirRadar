import { getAircraftWeatherFusion } from "@/lib/server/weather-fusion";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { normalizeIcaoHex } from "@/lib/server/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ hex: string }> }): Promise<Response> {
  const rateLimit = checkPublicRateLimit("weather", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  let decoded: string;
  try {
    decoded = decodeURIComponent((await context.params).hex);
  } catch {
    return Response.json({ error: "Invalid aircraft identifier" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const hex = normalizeIcaoHex(decoded);
  if (!hex) return Response.json({ error: "Invalid aircraft identifier" }, { status: 400, headers: { "Cache-Control": "no-store" } });

  try {
    const result = await getAircraftWeatherFusion(hex, { signal: request.signal });
    if (result.status === "unavailable") {
      return Response.json(result, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    if (result.status === "stale") {
      return Response.json(result, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "unavailable", reason: "Weather fusion could not be computed" }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
