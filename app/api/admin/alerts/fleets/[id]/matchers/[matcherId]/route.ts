import { requireWatchlistMutation } from "@/lib/server/watchlist-auth";
import { getAlertsFleetsRepository } from "@/lib/server/alerts-fleets-repository";
export const runtime = "nodejs";
export async function DELETE(request: Request, context: { params: Promise<{ matcherId: string }> }): Promise<Response> { const denied = requireWatchlistMutation(request); if (denied) return denied; await getAlertsFleetsRepository().deleteMatcher((await context.params).matcherId); return new Response(null, { status: 204 }); }
