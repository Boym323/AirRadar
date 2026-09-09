import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { watchlistValidationResponse } from "@/lib/server/watchlist-api";
import { requireWatchlistMutation } from "@/lib/server/watchlist-auth";
import {
  deleteWatchlistRule,
  isJsonRecord,
  listWatchlistRules,
  toPublicWatchlistResponse,
  updateWatchlistRule,
  WatchlistNotFoundError,
  WatchlistValidationError,
  type WatchlistRuleInput,
} from "@/lib/server/watchlist-store";

export const dynamic = "force-dynamic";

function noStoreHeaders(): HeadersInit {
  return { "Cache-Control": "no-store" };
}

function notFoundResponse(): Response {
  return Response.json({ error: "Watchlist rule not found", code: "not_found" }, { status: 404, headers: noStoreHeaders() });
}

async function readBody(request: Request): Promise<WatchlistRuleInput | Response> {
  try {
    const body: unknown = await request.json();
    return isJsonRecord(body) ? body : Response.json({ error: "Invalid watchlist rule", code: "invalid_rule" }, { status: 400, headers: noStoreHeaders() });
  } catch {
    return Response.json({ error: "Invalid JSON body", code: "invalid_rule" }, { status: 400, headers: noStoreHeaders() });
  }
}

async function resolveId(context: { params: Promise<{ id: string }> }): Promise<string | null> {
  try {
    const params = await context.params;
    return params.id ? decodeURIComponent(params.id) : null;
  } catch {
    return null;
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const rateLimit = checkPublicRateLimit("watchlist", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  const authorization = requireWatchlistMutation(request);
  if (authorization) return authorization;
  const id = await resolveId(context);
  if (!id) return notFoundResponse();
  const body = await readBody(request);
  if (body instanceof Response) return body;
  try {
    const rule = await updateWatchlistRule(id, body);
    const service = getAircraftStateService();
    service.reloadAlertConfig();
    await service.waitForReady();
    const response = toPublicWatchlistResponse(await listWatchlistRules(), service.getSnapshot());
    return Response.json({ rule: response.rules.find((item) => item.id === rule.id), ...response }, { headers: noStoreHeaders() });
  } catch (error) {
    if (error instanceof WatchlistNotFoundError) return notFoundResponse();
    if (error instanceof WatchlistValidationError) return watchlistValidationResponse(error);
    return Response.json({ error: "Watchlist could not be updated" }, { status: 500, headers: noStoreHeaders() });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const rateLimit = checkPublicRateLimit("watchlist", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  const authorization = requireWatchlistMutation(request);
  if (authorization) return authorization;
  const id = await resolveId(context);
  if (!id) return notFoundResponse();
  try {
    await deleteWatchlistRule(id);
    const service = getAircraftStateService();
    service.reloadAlertConfig();
    await service.waitForReady();
    return Response.json(toPublicWatchlistResponse(await listWatchlistRules(), service.getSnapshot()), { headers: noStoreHeaders() });
  } catch (error) {
    if (error instanceof WatchlistNotFoundError) return notFoundResponse();
    return Response.json({ error: "Watchlist could not be updated" }, { status: 500, headers: noStoreHeaders() });
  }
}
