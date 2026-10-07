import { simulateAlertRules } from "@/lib/server/alert-rule-simulator";
import { isWatchlistSessionValid } from "@/lib/server/watchlist-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (!isWatchlistSessionValid(request)) return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    return Response.json(await simulateAlertRules(await request.json()), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Simulation failed" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
