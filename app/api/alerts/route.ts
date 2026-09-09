import { listAlertHistory } from "@/lib/server/alert-history";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const rateLimit = checkPublicRateLimit("alertHistory", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "0");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "25");
  const result = await listAlertHistory({ page: Number.isFinite(page) ? page : 0, pageSize: Number.isFinite(pageSize) ? pageSize : 25 });
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
