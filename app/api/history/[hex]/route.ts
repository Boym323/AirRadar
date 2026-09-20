import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { getAircraftHistory } from "@/lib/server/history";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { normalizeIcaoHex } from "@/lib/server/validation";

export const dynamic = "force-dynamic";

const DEFAULT_HISTORY_LIMIT = 500;
const MAX_HISTORY_LIMIT = 500;

function requestedLimit(request: Request): number {
  const raw = new URL(request.url).searchParams.get("limit");
  if (raw === null || raw.trim() === "") return DEFAULT_HISTORY_LIMIT;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? Math.min(MAX_HISTORY_LIMIT, value) : DEFAULT_HISTORY_LIMIT;
}

export async function GET(request: Request, context: { params: Promise<{ hex: string }> }): Promise<Response> {
  const { hex } = await context.params;
  const rateLimit = checkPublicRateLimit("history", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  let decodedHex: string;
  try {
    decodedHex = decodeURIComponent(hex);
  } catch {
    return Response.json({ error: "Invalid aircraft identifier" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const normalizedHex = normalizeIcaoHex(decodedHex);
  if (!normalizedHex) {
    return Response.json({ error: "Invalid aircraft identifier" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const service = getAircraftStateService();
  await service.waitForReady();
  const current = service.getAircraft(normalizedHex);
  const history = await getAircraftHistory(normalizedHex, current, requestedLimit(request));
  return Response.json({ icaoHex: normalizedHex, ...history }, { headers: { "Cache-Control": "no-store" } });
}
