import { isWatchlistSessionValid } from "@/lib/server/watchlist-auth";
import { getAlertsFleetsRepository } from "@/lib/server/alerts-fleets-repository";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(request: Request): Promise<Response> { if (!isWatchlistSessionValid(request)) return Response.json({ error: "Unauthorized" }, { status: 401 }); const limit = Number(new URL(request.url).searchParams.get("limit") ?? "50"); return Response.json({ items: await getAlertsFleetsRepository().listOccurrences(Number.isFinite(limit) ? limit : 50) }, { headers: { "Cache-Control": "no-store" } }); }
