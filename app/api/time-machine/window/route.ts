import { getTimeMachineWindow, TIME_MACHINE_EVENT_REPLAY_MAX_WINDOW_MS, TimeMachineValidationError } from "@/lib/server/time-machine";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
export const dynamic = "force-dynamic";
export async function GET(request: Request): Promise<Response> {
  const limited = checkPublicRateLimit("history", request); if (!limited.allowed) return rateLimitResponse(limited);
  const url = new URL(request.url);
  const maxWindowMs = url.searchParams.get("mode") === "event-replay" ? TIME_MACHINE_EVENT_REPLAY_MAX_WINDOW_MS : undefined;\n  try { return Response.json(await getTimeMachineWindow(url.searchParams.get("from"), url.searchParams.get("to"), maxWindowMs), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { const status = error instanceof TimeMachineValidationError ? 400 : 503; return Response.json({ error: error instanceof Error ? error.message : "Historical window unavailable" }, { status, headers: { "Cache-Control": "no-store" } }); }
}
