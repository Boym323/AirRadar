import { isWatchlistAdminSessionValid } from "@/lib/server/watchlist-auth";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { getRuntimePerformanceDiagnostics } from "@/lib/server/runtime-performance";
import { getRuntimeHealthObservation } from "@/lib/server/runtime-health-observation";
import { getRuntimeStallEvidence } from "@/lib/server/runtime-stall-evidence";
import { getT58CpuProfileSummary } from "@/lib/server/t58-cpu-profile";
import { getOperationalTwinForensicsReport } from "@/lib/operational-twin/event-outcome";
import { toPublicRuntimePerformance } from "@/lib/server/public-diagnostics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEALTH_PHASES = [
  "health.total", "health.ready", "health.snapshot", "health.database", "health.atc",
  "health.atc.db-query", "health.atc.data-transformation", "health.atc.metadata-assembly", "health.event-loop",
] as const;

export async function GET(request: Request): Promise<Response> {
  const rateLimit = checkPublicRateLimit("runtimeTelemetry", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  const admin = isWatchlistAdminSessionValid(request);
  const metrics = getRuntimePerformanceDiagnostics();
  const phases = Object.fromEntries(HEALTH_PHASES.map((name) => {
    const item = metrics[name];
    return [name, item ? {
      calls: item.calls, avgMs: item.avgMs, maxMs: item.maxMs,
      p50Ms: item.p50Ms, p95Ms: item.p95Ms, p99Ms: item.p99Ms,
      cpuMs: item.cpuMs, waitMs: item.waitMs, windows: item.windows,
    } : null];
  }));
  const paths = Object.entries(metrics)
    .filter(([name]) => !name.startsWith("health."))
    .map(([name, item]) => ({
      name,
      calls: item.calls,
      totalMs: item.totalMs,
      avgMs: item.avgMs,
      maxMs: item.maxMs,
      p95Ms: item.p95Ms,
      p99Ms: item.p99Ms,
      cpuMs: item.cpuMs,
      waitMs: item.waitMs,
      windows: item.windows,
      processedAircraft: item.processedAircraft,
    }));
  const hotPaths = [...paths].sort((left, right) => right.totalMs - left.totalMs).slice(0, 12);
  // Low-cost individual Twin validators may fall outside the top 12, despite
  // the inclusive parent being slow. Export exactly these five separately.
  const validatorPaths = paths.filter((path) => path.name.startsWith("twin.")).slice(0, 5);
  const ingestPaths = paths.filter((path) => path.name.startsWith("ingest.")).slice(0, 3);
  const runtime = getRuntimeHealthObservation();
  const operationalTwinForensics = getOperationalTwinForensicsReport();
  const response = {
    schemaVersion: 4, scope: "process-local", phases, hotPaths, validatorPaths, ingestPaths, operationalTwinForensics,
    stallEvidence: getRuntimeStallEvidence(),
    t58CpuProfile: getT58CpuProfileSummary(),
    runtime: {
      status: runtime.status,
      v8HeapSpaces: runtime.v8HeapSpaces,
      majorGcCount: runtime.majorGcCount,
      postMajorGc: runtime.postMajorGc,
      heapUsedBytes: runtime.heapUsedBytes, heapTotalBytes: runtime.heapTotalBytes,
      rssBytes: runtime.rssBytes, externalBytes: runtime.externalBytes, arrayBuffersBytes: runtime.arrayBuffersBytes,
      cpuUserTimeMs: runtime.cpuUserTimeMs, cpuSystemTimeMs: runtime.cpuSystemTimeMs,
      cpuIntervalUserTimeMs: runtime.cpuIntervalUserTimeMs, cpuIntervalSystemTimeMs: runtime.cpuIntervalSystemTimeMs,
      cpuIntervalPercent: runtime.cpuIntervalPercent,
      eventLoopLagP50Ms: runtime.eventLoopLagP50Ms,
      eventLoopLagP95Ms: runtime.eventLoopLagP95Ms, eventLoopLagP99Ms: runtime.eventLoopLagP99Ms,
      eventLoopLagWindows: runtime.eventLoopLagWindows,
      gcSampleCount: runtime.gcSampleCount, gcCount: runtime.gcCount, gcTotalPauseMs: runtime.gcTotalPauseMs,
      gcMaxPauseMs: runtime.gcMaxPauseMs,
      gcAveragePauseMs: runtime.gcAveragePauseMs,
    },
  };
  return Response.json(admin ? response : toPublicRuntimePerformance(response), { headers: { "Cache-Control": "no-store" } });
}
