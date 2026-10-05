import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { isWatchlistSessionValid } from "@/lib/server/watchlist-auth";
import { normalizeIcaoHex } from "@/lib/server/validation";
import { TRACK_FUSION_SHADOW_VERSION } from "@/lib/track-fusion";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function noStore(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ hex: string }> },
): Promise<Response> {
  if (!isWatchlistSessionValid(request)) return noStore({ error: "Unauthorized" }, 401);

  let decoded: string;
  try {
    decoded = decodeURIComponent((await context.params).hex);
  } catch {
    return noStore({ version: TRACK_FUSION_SHADOW_VERSION, error: "invalid_aircraft" }, 400);
  }
  const hex = normalizeIcaoHex(decoded);
  if (!hex) return noStore({ version: TRACK_FUSION_SHADOW_VERSION, error: "invalid_aircraft" }, 400);

  const service = getAircraftStateService();
  const track = service.getTrackFusionShadowTrack(hex);
  if (!track) {
    return noStore({
      version: TRACK_FUSION_SHADOW_VERSION,
      icaoHex: hex,
      status: "no_data",
      diagnostics: service.getTrackFusionShadowDiagnostics(),
    }, 404);
  }

  return noStore({
    version: TRACK_FUSION_SHADOW_VERSION,
    status: "shadow",
    track,
  });
}
