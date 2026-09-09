import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { toPublicLiveStateSnapshot } from "@/lib/server/public-serialization";
import { acquireSseClient } from "@/lib/server/sse-capacity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function event(name: string, payload: unknown): string {
  return `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export async function GET(request: Request): Promise<Response> {
  const releaseSseClient = acquireSseClient();
  if (!releaseSseClient) {
    return new Response("SSE capacity reached", {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "15" },
    });
  }
  const encoder = new TextEncoder();
  const service = getAircraftStateService();
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: () => void = () => undefined;
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
  let pending: Uint8Array | null = null;

  const close = () => {
    if (closed) return;
    closed = true;
    releaseSseClient();
    unsubscribe();
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    try {
      controllerRef?.close();
    } catch {
      // The client may have cancelled the stream before the abort event arrived.
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
      const send = (snapshot: ReturnType<typeof service.getSnapshot>) => {
        if (closed) return;
        const chunk = encoder.encode(event("snapshot", toPublicLiveStateSnapshot(snapshot)));
        if ((controller.desiredSize ?? 0) > 0) {
          try {
            controller.enqueue(chunk);
          } catch {
            close();
          }
        } else {
          // Keep only the newest snapshot for a slow client; never build an unbounded queue.
          pending = chunk;
        }
      };
      unsubscribe = service.subscribe(send);
      send(service.getSnapshot());
      heartbeat = setInterval(() => {
        if (closed) return;
        try {
          if ((controller.desiredSize ?? 0) > 0) controller.enqueue(encoder.encode(": keep-alive\n\n"));
        } catch {
          close();
        }
      }, 15000);
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
