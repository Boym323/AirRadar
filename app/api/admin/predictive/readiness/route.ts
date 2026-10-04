import { isWatchlistSessionValid } from "@/lib/server/watchlist-auth";
import { readPredictiveReadinessReport } from "@/lib/server/predictive-readiness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  if (!isWatchlistSessionValid(request)) {
    return Response.json({ error: "Unauthorized" }, {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const report = await readPredictiveReadinessReport();
  return Response.json(report, {
    headers: { "Cache-Control": "no-store" },
  });
}
