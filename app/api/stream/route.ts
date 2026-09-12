import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { toPublicLiveStateSnapshot } from "@/lib/server/public-serialization";
import { acquireSseClient, recordSsePayload, type SseProtocol } from "@/lib/server/sse-capacity";
import { parseCoverage } from "@/lib/server/coverage";
import { SseDeltaEncoder } from "@/lib/server/sse-delta";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function event(name: string, payload: unknown): string {
  return `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const protocol: SseProtocol = url.searchParams.get("v") === "2" ? "v2" : "v1";
  const releaseSseClient = acquireSseClient(protocol);
  if (!releaseSseClient) {
    return new Response("SSE capacity reached", {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "15" },
    });
  }
  const encoder = new TextEncoder();
  const service = getAircraftStateService();
  const coverage = parseCoverage(url.searchParams.get("coverage"));
  const deltaEncoder = protocol === "v2" ? new SseDeltaEncoder() : null;
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: () => void = () => undefined;
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
  let pendingSnapshot: ReturnType<typeof service.getSnapshot> | null = null;
  let deliverSnapshot: ((snapshot: ReturnType<typeof service.getSnapshot>) => void) | null = null;

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
      const deliver = (snapshot: ReturnType<typeof service.getSnapshot>) => {
        if (closed) return;
        const publicSnapshot = toPublicLiveStateSnapshot(snapshot);
        const nextEvent = deltaEncoder?.next(publicSnapshot);
        const eventName = nextEvent?.event ?? "snapshot";
        const payload = nextEvent?.payload ?? publicSnapshot;
        const chunk = encoder.encode(event(eventName, payload));
        if ((controller.desiredSize ?? 0) > 0) {
          try {
            controller.enqueue(chunk);
            if (nextEvent) {
              if (nextEvent.event === "delta") recordSsePayload(protocol, nextEvent.event, chunk.byteLength, nextEvent.payload.changed.length, nextEvent.payload.removed.length);
              else recordSsePayload(protocol, nextEvent.event, chunk.byteLength);
            }
          } catch {
            close();
          }
        } else {
          // Keep only the newest internal snapshot for a slow client; the
          // delta encoder advances only after the chunk is actually queued.
          pendingSnapshot = snapshot;
        }
      };
      deliverSnapshot = deliver;
      const send = (snapshot: ReturnType<typeof service.getSnapshot>) => {
        if (closed) return;
        if ((controller.desiredSize ?? 0) > 0) deliver(snapshot);
        else pendingSnapshot = snapshot;
      };
      unsubscribe = service.subscribe(send, { coverage });
      send(service.getSnapshot({ coverage }));
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
      if (!closed && pendingSnapshot && (controller.desiredSize ?? 0) > 0) {
        const snapshot = pendingSnapshot;
        pendingSnapshot = null;
        deliverSnapshot?.(snapshot);
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
