import { getWebPushPublicKey, isWebPushConfigured } from "@/lib/server/web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Response {
  const key = getWebPushPublicKey();
  return Response.json({ enabled: isWebPushConfigured(), publicKey: isWebPushConfigured() ? key : null }, { headers: { "Cache-Control": "public, max-age=3600" } });
}
