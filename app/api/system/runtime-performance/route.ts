import { isWatchlistSessionValid } from "@/lib/server/watchlist-auth";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { getRuntimePerformanceDiagnostics } from "@/lib/server/runtime-performance";
import { getRuntimeHealthObservation } from "@/lib/server/runtime-health-observation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEALTH_PHASES = ["health.total", "health.ready", "health.snapshot", "health.database", "health.atc"] as const;

export async function GET(request: Request): Promise<Response> {
  const rateLimit = checkPublicRateLimit("runtimeTelemetry", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  if (!isWatchlistSessionValid(request)) {
    return Response.json({ error: "Authentication required", code: "auth_required" }, {
      status: 401, headers: { "Cache-Control": "no-store" },
    });
  }
  const metrics = getRuntimePerformanceDiagnostics();
  const phases = Object.fromEntries(HEALTH_PHASES.map((name) => {
    const item = metrics[name];
    return [name, item ? {
      calls: item.calls, avgMs: item.avgMs, maxMs: item.maxMs,
      p50Ms: item.p50Ms, p95Ms: item.p95Ms, p99Ms: item.p99Ms,
    } : null];
  }));
  const runtime = getRuntimeHealthObservation();
  return Response.json({
    schemaVersion: 1, scope: "process-local", phases,
    runtime: {
      status: runtime.status,
      heapUsedBytes: runtime.heapUsedBytes, heapTotalBytes: runtime.heapTotalBytes,
      rssBytes: runtime.rssBytes, eventLoopLagP50Ms: runtime.eventLoopLagP50Ms,
      eventLoopLagP95Ms: runtime.eventLoopLagP95Ms, eventLoopLagP99Ms: runtime.eventLoopLagP99Ms,
      gcSampleCount: runtime.gcSampleCount, gcMaxPauseMs: runtime.gcMaxPauseMs,
      gcAveragePauseMs: runtime.gcAveragePauseMs,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
