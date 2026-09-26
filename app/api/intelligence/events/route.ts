import { getFlightIntelligenceService } from "@/lib/server/flight-intelligence";
import { checkPublicRateLimit } from "@/lib/server/rate-limit";
import type { FlightEventType } from "@/lib/intelligence/types";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request): Promise<Response> {
  const limited = checkPublicRateLimit("intelligence", request); if (!limited.allowed) return new Response("Rate limit exceeded", { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } });
  const url = new URL(request.url); const rawLimit = Number(url.searchParams.get("limit") ?? 25); const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, Math.floor(rawLimit))) : 25;
  const allowed = new Set(["APPROACH", "LANDING", "TAKEOFF", "GO_AROUND", "HOLDING", "HOLDING_CANDIDATE", "HOLDING_ENDED", "LEVEL_OFF", "UNUSUAL_TURN", "ORBIT", "DIVERSION", "TOP_OF_DESCENT", "AIRSPACE_ENTRY", "AIRSPACE_EXIT"]); const type = url.searchParams.get("type");
  const eventType = allowed.has(type ?? "") ? type as FlightEventType : undefined;
  const events = await getFlightIntelligenceService().query({ limit, type: eventType, aircraft: url.searchParams.get("aircraft") ?? undefined, since: url.searchParams.get("since") ?? undefined });
  return Response.json({ events, source: "local" }, { headers: { "Cache-Control": "no-store" } });
}
