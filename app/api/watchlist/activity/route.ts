import { listAlertHistory } from "@/lib/server/alert-history";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { listWatchlistRules } from "@/lib/server/watchlist-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function boundedInteger(value: string | null, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(parsed)));
}

export async function GET(request: Request): Promise<Response> {
  const rateLimit = checkPublicRateLimit("watchlist", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const url = new URL(request.url);
  const page = boundedInteger(url.searchParams.get("page"), 0, 0, 10_000);
  const pageSize = boundedInteger(url.searchParams.get("pageSize"), 20, 1, 50);
  const requestedRuleId = url.searchParams.get("ruleId")?.trim() || null;
  const rules = await listWatchlistRules();
  const knownRuleIds = new Set(rules.map((rule) => rule.id));
  const ruleIds = requestedRuleId
    ? knownRuleIds.has(requestedRuleId) ? [requestedRuleId] : []
    : [...knownRuleIds];

  const result = await listAlertHistory({ page, pageSize, ruleIds });
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
