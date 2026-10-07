import { getAlertsFleetsRepository } from "@/lib/server/alerts-fleets-repository";
import { getNotificationCenterStateStore } from "@/lib/server/notification-center-state";
import { getNotificationPreferencesStore } from "@/lib/server/notification-preferences";
import { isWatchlistSessionValid, requireWatchlistMutation } from "@/lib/server/watchlist-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request): Promise<Response> {
  if (!isWatchlistSessionValid(request)) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  const url = new URL(request.url);
  const view = url.searchParams.get("view");
  if (view === "preferences") {
    return Response.json({ preferences: getNotificationPreferencesStore().get() }, { headers });
  }
  if (view === "notification-state") {
    return Response.json({ notificationState: getNotificationCenterStateStore().get() }, { headers });
  }
  const limit = Number(url.searchParams.get("limit") ?? "100");
  return Response.json({
    items: await getAlertsFleetsRepository().listDeliveries(Number.isFinite(limit) ? limit : 100),
  }, { headers });
}

export async function PATCH(request: Request): Promise<Response> {
  const denied = requireWatchlistMutation(request);
  if (denied) return denied;
  const url = new URL(request.url);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body", code: "invalid_request" }, { status: 400, headers });
  }
  if (url.searchParams.get("view") === "notification-state") {
    try {
      return Response.json({ notificationState: getNotificationCenterStateStore().update(body) }, { headers });
    } catch {
      return Response.json({ error: "Invalid notification center state", code: "invalid_notification_state" }, { status: 400, headers });
    }
  }
  try {
    return Response.json({ preferences: getNotificationPreferencesStore().update(body) }, { headers });
  } catch {
    return Response.json({ error: "Invalid notification preferences", code: "invalid_preferences" }, { status: 400, headers });
  }
}
