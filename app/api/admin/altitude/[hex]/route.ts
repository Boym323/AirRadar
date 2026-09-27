import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { isWatchlistSessionValid } from "@/lib/server/watchlist-auth";
import { normalizeIcaoHex } from "@/lib/server/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ hex: string }> }): Promise<Response> {
  if (!isWatchlistSessionValid(request)) return Response.json({ error: "Not found" }, { status: 404 });
  const raw = decodeURIComponent((await context.params).hex);
  const icaoHex = normalizeIcaoHex(raw);
  if (!icaoHex) return Response.json({ error: "Invalid aircraft identifier" }, { status: 400 });
  const aircraft = getAircraftStateService().getAircraft(icaoHex, "extended");
  if (!aircraft) return Response.json({ error: "Aircraft not found" }, { status: 404 });
  const decision = aircraft.altitudeDecision ?? null;
  return Response.json({
    icaoHex: aircraft.icaoHex,
    callsign: aircraft.callsign,
    altitude: aircraft.altitude,
    altitudeSource: decision?.selected?.source ?? null,
    altitudeObservedAt: decision?.selected?.observedAt ?? null,
    ageMs: decision?.selected?.freshnessAgeMs ?? null,
    decisionReason: decision?.reason ?? null,
    candidates: decision?.candidates ?? [],
    rejected: decision?.rejected ?? [],
    anomaly: decision?.anomaly ?? null,
  }, { headers: { "Cache-Control": "no-store" } });
}
