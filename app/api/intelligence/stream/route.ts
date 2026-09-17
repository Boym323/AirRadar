import { getFlightIntelligenceService } from "@/lib/server/flight-intelligence";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
export async function GET(request: Request): Promise<Response> {
  const encoder = new TextEncoder(); const service = getFlightIntelligenceService(); let closed = false; let unsubscribe: () => void = () => undefined; let heartbeat: ReturnType<typeof setInterval> | null = null; let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  const close = () => { if (closed) return; closed = true; unsubscribe(); if (heartbeat) clearInterval(heartbeat); try { controller?.close(); } catch {} };
  const stream = new ReadableStream<Uint8Array>({ start(current) { controller = current; unsubscribe = service.subscribe((event) => { if (!closed && (current.desiredSize ?? 0) > 0) current.enqueue(encoder.encode(`event: intelligence\ndata: ${JSON.stringify(event)}\n\n`)); }); heartbeat = setInterval(() => { if (!closed && (current.desiredSize ?? 0) > 0) current.enqueue(encoder.encode(": keep-alive\n\n")); }, 15000); request.signal.addEventListener("abort", close, { once: true }); if (request.signal.aborted) close(); }, cancel: close });
  return new Response(stream, { headers: { "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "Content-Type": "text/event-stream; charset=utf-8", "X-Accel-Buffering": "no" } });
}
