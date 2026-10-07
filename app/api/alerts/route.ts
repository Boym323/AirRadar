import { listAlertHistory, type AlertHistoryFilter, type AlertNotificationStatus } from "@/lib/server/alert-history";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function alertFilter(value: string | null): AlertHistoryFilter {
  return value === "watchlist" || value === "emergency" || value === "records" || value === "intelligence" ? value : "all";
}

function deliveryStatuses(value: string | null): AlertNotificationStatus[] | undefined {
  if (!value) return undefined;
  const allowed = new Set<AlertNotificationStatus>(["pending", "attempted", "delivered", "failed", "center_only", "disabled"]);
  const parsed = value.split(",").map((item) => item.trim()).filter((item): item is AlertNotificationStatus => allowed.has(item as AlertNotificationStatus));
  return parsed.length ? parsed : [];
}

function ruleIds(url: URL): string[] | undefined {
  const values = [...url.searchParams.getAll("ruleId"), ...url.searchParams.getAll("ruleIds").flatMap((value) => value.split(","))]
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 20);
  return values.length ? values : undefined;
}

export async function GET(request: Request): Promise<Response> {
  const rateLimit = checkPublicRateLimit("alertHistory", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "0");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "25");
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  const result = await listAlertHistory({
    page: Number.isFinite(page) ? page : 0,
    pageSize: Number.isFinite(pageSize) ? pageSize : 25,
    filter: alertFilter(url.searchParams.get("filter")),
    deliveryStatuses: deliveryStatuses(url.searchParams.get("delivery")),
    ruleIds: ruleIds(url),
    query: query || undefined,
  });
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
