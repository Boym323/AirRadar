import { isAviationNavDataEnabled } from "@/lib/server/config";
import { defaultAviationNavDataProvider } from "@/lib/server/aviation-nav-data-provider";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import type { AviationNavPointKind } from "@/lib/navigation-data/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function finite(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function kinds(value: string | null): AviationNavPointKind[] {
  if (!value) return ["NAVAID", "FIX"];
  const parsed = value.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean);
  return [...new Set(parsed.filter((item): item is AviationNavPointKind => item === "NAVAID" || item === "FIX"))];
}

export async function GET(request: Request): Promise<Response> {
  if (!isAviationNavDataEnabled()) {
    return Response.json({ enabled: false, available: false, points: [], source: "Aviation Weather Center" }, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  const rateLimit = checkPublicRateLimit("mapContext", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const url = new URL(request.url);
  const latitude = finite(url.searchParams.get("lat"));
  const longitude = finite(url.searchParams.get("lon"));
  const radiusNm = finite(url.searchParams.get("radiusNm")) ?? 120;
  const requestedKinds = kinds(url.searchParams.get("kinds"));

  if (latitude === null || longitude === null) {
    return Response.json({ error: "lat and lon are required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const snapshot = await defaultAviationNavDataProvider.getData({
      latitude,
      longitude,
      radiusNm,
      kinds: requestedKinds,
    }, request.signal);
    return Response.json({ enabled: true, available: true, ...snapshot }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid aviation nav query") {
      return Response.json({ error: error.message }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ error: "Aviation navigation data temporarily unavailable" }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
