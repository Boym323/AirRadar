import { getDeliveryHealthSnapshot } from "@/lib/server/delivery-health";
import { isWatchlistSessionValid } from "@/lib/server/watchlist-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  if (!isWatchlistSessionValid(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json(await getDeliveryHealthSnapshot(), { headers: { "Cache-Control": "no-store" } });
}
