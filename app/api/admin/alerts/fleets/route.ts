import { requireWatchlistMutation, isWatchlistSessionValid } from "@/lib/server/watchlist-auth";
import { getAlertsFleetsRepository } from "@/lib/server/alerts-fleets-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request): Promise<Response> {
  if (!isWatchlistSessionValid(request)) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  return Response.json({ fleets: await getAlertsFleetsRepository().listFleets() }, { headers });
}

export async function POST(request: Request): Promise<Response> {
  const denied = requireWatchlistMutation(request); if (denied) return denied;
  try { const body = await request.json() as Record<string, unknown>; if (typeof body.name !== "string" || !body.name.trim()) return Response.json({ error: "name is required" }, { status: 400, headers }); const fleet = await getAlertsFleetsRepository().saveFleet({ id: typeof body.id === "string" ? body.id : undefined, name: body.name, description: typeof body.description === "string" ? body.description : null, enabled: body.enabled !== false }); return Response.json({ fleet }, { status: body.id ? 200 : 201, headers }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Fleet could not be saved" }, { status: 400, headers }); }
}
