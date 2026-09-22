import { getFlightIntelligenceService } from "@/lib/server/flight-intelligence";
import { acquireSseClient } from "@/lib/server/sse-capacity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function frame(payload: unknown): Uint8Array {
  return new TextEncoder().encode(`event: intelligence\ndata: ${JSON.stringify(payload)}\n\n`);
}

export async function GET(request: Request): Promise<Response> {
  const releaseSseClient = acquireSseClient("v1");
  if (!releaseSseClient) {
    return new Response("SSE capacity reached", {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "15" },
    });
  }

  const encoder = new TextEncoder();
  const service = getFlightIntelligenceService();
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
      // The consumer may already have cancelled the stream.
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
      unsubscribe = service.subscribe((event) => {
        if (closed) return;
        const chunk = frame(event);
        if ((controller.desiredSize ?? 0) > 0) {
          try {
            controller.enqueue(chunk);
          } catch {
            close();
          }
        } else {
          // Intelligence is a live signal, not an audit log. Keep only the
          // newest event for a slow client; durable history remains in DB.
          pending = chunk;
        }
      });
      heartbeat = setInterval(() => {
        if (closed || (controller.desiredSize ?? 0) <= 0) return;
        try {
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
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
