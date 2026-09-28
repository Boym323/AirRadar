import { getAircraftWeatherDiagnostics } from "@/lib/server/aircraft-weather";
import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { isWatchlistSessionValid } from "@/lib/server/watchlist-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  if (!isWatchlistSessionValid(request)) return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const local = getAircraftStateService().getDiagnostics().local as Record<string, unknown> | null;
  return Response.json({
    generatedAt: new Date().toISOString(),
    ...getAircraftWeatherDiagnostics(),
    bds44Decoder: {
      candidates: typeof local?.bds44 === "number" ? local.bds44 : 0,
      ambiguous: typeof local?.commBAmbiguous === "number" ? local.commBAmbiguous : 0,
      rejected: typeof local?.commBRejected === "number" ? local.commBRejected : 0,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
