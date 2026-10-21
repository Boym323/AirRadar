import { requireWatchlistMutation } from "@/lib/server/watchlist-auth";
import { parseWebPushSubscriptionInput, saveWebPushSubscription, removeWebPushSubscription } from "@/lib/server/web-push-store";
import { isWebPushConfigured } from "@/lib/server/web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8_192;

async function readJson(request: Request): Promise<unknown | null> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return null;
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(text) as unknown;
  } catch { return null; }
  finally { reader.releaseLock(); }
}

export async function POST(request: Request): Promise<Response> {
  const denied = requireWatchlistMutation(request);
  if (denied) return denied;
  const subscription = parseWebPushSubscriptionInput(await readJson(request));
  if (!subscription) {
    return Response.json({ error: "Invalid push subscription" }, { status: 400 });
  }
  if (!isWebPushConfigured()) return Response.json({ error: "Web push is not configured" }, { status: 503 });
  await saveWebPushSubscription(subscription);
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request): Promise<Response> {
  const denied = requireWatchlistMutation(request);
  if (denied) return denied;
  const body = await readJson(request);
  if (!body || typeof body !== "object" || !("endpoint" in body) || typeof body.endpoint !== "string" || body.endpoint.length > 2_048 || !body.endpoint.startsWith("https://")) {
    return Response.json({ error: "Invalid push subscription endpoint" }, { status: 400 });
  }
  try { await removeWebPushSubscription(body.endpoint); }
  catch { return Response.json({ error: "Invalid push subscription endpoint" }, { status: 400 }); }
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
