import { getSystemStatusStream } from "@/lib/server/system-status-stream";
import { toAdminSystemStatus, toPublicSystemStatus } from "@/lib/server/system-status";
import { isWatchlistSessionValid } from "@/lib/server/watchlist-auth";
import { acquireSseClient } from "@/lib/server/sse-capacity";
import { checkPublicRateLimit, getRateLimitClientKey, rateLimitResponse } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function event(payload: unknown): Uint8Array {
  return new TextEncoder().encode(`event: snapshot\ndata: ${JSON.stringify(payload)}\n\n`);
}

export async function GET(request: Request): Promise<Response> {
  const rateLimit = checkPublicRateLimit("systemStatus", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const releaseSseClient = acquireSseClient("v1", getRateLimitClientKey(request), "system");
  if (!releaseSseClient) {
    return new Response("SSE capacity reached", {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "15" },
    });
  }

  const admin = isWatchlistSessionValid(request);
  let closed = false;
  let unsubscribe: () => void = () => undefined;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
  let pending: Uint8Array | null = null;

  const close = () => {
    if (closed) return;
    closed = true;
    releaseSseClient();
    unsubscribe();
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    pending = null;
    try {
      controllerRef?.close();
    } catch {
      // The client may already have cancelled the stream.
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
      const send = (status: Parameters<typeof toPublicSystemStatus>[0]) => {
        if (closed) return;
        const payload = admin ? toAdminSystemStatus(status) : toPublicSystemStatus(status);
        const chunk = event(payload);
        if ((controller.desiredSize ?? 0) > 0) {
          try {
            controller.enqueue(chunk);
          } catch {
            close();
          }
        } else {
          // Keep only the newest diagnostic snapshot for a slow client.
          pending = chunk;
        }
      };

      unsubscribe = getSystemStatusStream().subscribe(send);
      heartbeat = setInterval(() => {
        if (closed || (controller.desiredSize ?? 0) <= 0) return;
        try {
          controller.enqueue(new TextEncoder().encode(": keep-alive\n\n"));
        } catch {
          close();
        }
      }, 15_000);
      request.signal.addEventListener("abort", close, { once: true });
      if (request.signal.aborted) close();
    },
    pull(controller) {
      if (!closed && pending && (controller.desiredSize ?? 0) > 0) {
        const chunk = pending;
        pending = null;
        try {
          controller.enqueue(chunk);
        } catch {
          close();
        }
      }
    },
    cancel() {
      close();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
