import { requireWatchlistMutation } from "@/lib/server/watchlist-auth";
import { saveWebPushSubscription, removeWebPushSubscription } from "@/lib/server/web-push-store";
import { isWebPushConfigured } from "@/lib/server/web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const denied = requireWatchlistMutation(request);
  if (denied) return denied;
  if (!isWebPushConfigured()) return Response.json({ error: "Web push is not configured" }, { status: 503 });
  const body = await request.json() as { endpoint?: unknown; expirationTime?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof body.endpoint !== "string" || !body.endpoint.startsWith("https://") || typeof body.keys?.p256dh !== "string" || typeof body.keys.auth !== "string") {
    return Response.json({ error: "Invalid push subscription" }, { status: 400 });
  }
  await saveWebPushSubscription({ endpoint: body.endpoint, expirationTime: typeof body.expirationTime === "number" ? body.expirationTime : null, keys: { p256dh: body.keys.p256dh, auth: body.keys.auth } });
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request): Promise<Response> {
  const denied = requireWatchlistMutation(request);
  if (denied) return denied;
  const body = await request.json() as { endpoint?: unknown };
  if (typeof body.endpoint === "string") await removeWebPushSubscription(body.endpoint);
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
