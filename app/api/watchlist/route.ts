import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { watchlistValidationResponse } from "@/lib/server/watchlist-api";
import {
  createWatchlistRule,
  isJsonRecord,
  listWatchlistRules,
  toPublicWatchlistResponse,
  WatchlistValidationError,
  type WatchlistRuleInput,
} from "@/lib/server/watchlist-store";

export const dynamic = "force-dynamic";

function noStoreHeaders(): HeadersInit {
  return { "Cache-Control": "no-store" };
}

async function readBody(request: Request): Promise<WatchlistRuleInput | Response> {
  try {
    const body: unknown = await request.json();
    return isJsonRecord(body) ? body : Response.json({ error: "Invalid watchlist rule", code: "invalid_rule" }, { status: 400, headers: noStoreHeaders() });
  } catch {
    return Response.json({ error: "Invalid JSON body", code: "invalid_rule" }, { status: 400, headers: noStoreHeaders() });
  }
}

export async function GET(): Promise<Response> {
  const rateLimit = checkPublicRateLimit("watchlist");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  const service = getAircraftStateService();
  await service.waitForReady();
  return Response.json(toPublicWatchlistResponse(await listWatchlistRules(), service.getSnapshot()), { headers: noStoreHeaders() });
}

export async function POST(request: Request): Promise<Response> {
  const rateLimit = checkPublicRateLimit("watchlist");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  const body = await readBody(request);
  if (body instanceof Response) return body;
  try {
    const rule = await createWatchlistRule(body);
    const service = getAircraftStateService();
    service.reloadAlertConfig();
    await service.waitForReady();
    const response = toPublicWatchlistResponse(await listWatchlistRules(), service.getSnapshot());
    return Response.json({ rule: response.rules.find((item) => item.id === rule.id), ...response }, { status: 201, headers: noStoreHeaders() });
  } catch (error) {
    if (error instanceof WatchlistValidationError) return watchlistValidationResponse(error);
    return Response.json({ error: "Watchlist could not be updated" }, { status: 500, headers: noStoreHeaders() });
  }
}
