import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { defaultSondeHubProvider, isSondeHubEnabled } from "@/lib/server/sondehub-provider";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ serial: string }> }): Promise<Response> {
  if (!isSondeHubEnabled()) return Response.json({ enabled: false }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const limit = checkPublicRateLimit("mapContext", request);
  if (!limit.allowed) return rateLimitResponse(limit);
  const { serial } = await context.params;
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(serial)) return Response.json({ error: "Invalid serial" }, { status: 400 });
  const value = await defaultSondeHubProvider.getDetail(serial);
  return Response.json(value ?? { available: false, serial }, { status: value ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
