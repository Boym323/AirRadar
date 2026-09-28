import { getNavigationIntegrityService } from "@/lib/server/navigation-integrity";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";
const MAX_RANGE_MS = 30 * 24 * 60 * 60_000;

export async function GET(request: Request): Promise<Response> {
  const rateLimit = checkPublicRateLimit("aircraft", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  const params = new URL(request.url).searchParams;
  const to = params.get("to") ? Date.parse(params.get("to")!) : Date.now();
  const from = params.get("from") ? Date.parse(params.get("from")!) : to - 24 * 60 * 60_000;
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to || to - from > MAX_RANGE_MS) return Response.json({ error: "Invalid or unbounded navigation integrity history range" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const anomalies = (await getNavigationIntegrityService().getHistory(new Date(from), new Date(to))).slice(0, 200);
  return Response.json({ from: new Date(from).toISOString(), to: new Date(to).toISOString(), anomalies }, { headers: { "Cache-Control": "no-store" } });
}
