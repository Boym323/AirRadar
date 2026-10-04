import { defaultPirepProvider } from "@/lib/server/pirep-provider";
import { isAviationWeatherEnabled } from "@/lib/server/config";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function finite(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: Request): Promise<Response> {
  if (!isAviationWeatherEnabled()) {
    return Response.json({ enabled: false, available: false, source: "Aviation Weather Center", reports: [] }, { headers: { "Cache-Control": "no-store" } });
  }

  const rateLimit = checkPublicRateLimit("weather", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const url = new URL(request.url);
  const latitude = finite(url.searchParams.get("lat"));
  const longitude = finite(url.searchParams.get("lon"));
  const radiusNm = finite(url.searchParams.get("radiusNm")) ?? 100;
  const hours = finite(url.searchParams.get("hours")) ?? 6;
  const altitudeFt = finite(url.searchParams.get("altitudeFt"));

  if (latitude === null || longitude === null) {
    return Response.json({ error: "lat and lon are required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const snapshot = await defaultPirepProvider.getPireps({ latitude, longitude, radiusNm, hours, altitudeFt }, request.signal);
    return Response.json({ enabled: true, available: true, ...snapshot }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid PIREP query") {
      return Response.json({ error: "Invalid PIREP query" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ error: "PIREP/AIREP data temporarily unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
