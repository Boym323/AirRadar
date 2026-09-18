import { getTimeMachineRange, TimeMachineDatabaseUnavailableError } from "@/lib/server/time-machine";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
export const dynamic = "force-dynamic";
export async function GET(request: Request): Promise<Response> {
  const limited = checkPublicRateLimit("history", request); if (!limited.allowed) return rateLimitResponse(limited);
  try { return Response.json(await getTimeMachineRange(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return Response.json({ error: error instanceof TimeMachineDatabaseUnavailableError ? "Historical data unavailable" : "Historical range could not be loaded" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
