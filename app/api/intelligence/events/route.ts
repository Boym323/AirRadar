import { getFlightIntelligenceService } from "@/lib/server/flight-intelligence";
import { checkPublicRateLimit } from "@/lib/server/rate-limit";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request): Promise<Response> {
  const limited = checkPublicRateLimit("intelligence", request); if (!limited.allowed) return new Response("Rate limit exceeded", { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } });
  const url = new URL(request.url); const rawLimit = Number(url.searchParams.get("limit") ?? 25); const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, Math.floor(rawLimit))) : 25;
  const allowed = new Set(["APPROACH", "LANDING", "TAKEOFF", "GO_AROUND", "HOLDING", "AIRSPACE_ENTRY", "AIRSPACE_EXIT"]); const type = url.searchParams.get("type");
  const events = await getFlightIntelligenceService().query({ limit, type: allowed.has(type ?? "") ? type as any : undefined, aircraft: url.searchParams.get("aircraft") ?? undefined, since: url.searchParams.get("since") ?? undefined });
  return Response.json({ events, source: "local" }, { headers: { "Cache-Control": "no-store" } });
}
