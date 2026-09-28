import { getNavigationIntegrityService } from "@/lib/server/navigation-integrity";
import { isWatchlistSessionValid } from "@/lib/server/watchlist-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  if (!isWatchlistSessionValid(request)) return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const params = new URL(request.url).searchParams;
  const rawWindow = params.get("window") ?? "15m";
  const rawLimit = params.get("limit") ?? "20";
  if (!["5m", "15m", "30m", "60m"].includes(rawWindow) || !/^\d{1,3}$/.test(rawLimit)) return Response.json({ error: "Invalid bounds" }, { status: 400 });
  const limit = Math.min(100, Math.max(1, Number(rawLimit)));
  const response = getNavigationIntegrityService().getCurrent(rawWindow as "5m" | "15m" | "30m" | "60m");
  return Response.json({ generatedAt: response.generatedAt, window: response.window, candidates: response.activeAnomalies.slice(0, limit) }, { headers: { "Cache-Control": "no-store" } });
}
