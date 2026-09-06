import { getAircraftStateService } from "@/lib/server/aircraft-state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function event(name: string, payload: unknown): string {
  return `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export async function GET(request: Request): Promise<Response> {
  const encoder = new TextEncoder();
  const service = getAircraftStateService();
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: () => void = () => undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (snapshot: ReturnType<typeof service.getSnapshot>) => {
        if (!closed) controller.enqueue(encoder.encode(event("snapshot", snapshot)));
      };
      unsubscribe = service.subscribe(send);
      send(service.getSnapshot());
      heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(": keep-alive\n\n"));
      }, 15000);
      request.signal.addEventListener("abort", () => {
        closed = true;
        unsubscribe();
        if (heartbeat) clearInterval(heartbeat);
        controller.close();
      });
    },
    cancel() {
      closed = true;
      unsubscribe();
      if (heartbeat) clearInterval(heartbeat);
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
