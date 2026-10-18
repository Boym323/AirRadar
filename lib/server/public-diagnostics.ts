import type { RuntimeTelemetryHistory } from "@/lib/server/runtime-telemetry";

const HEALTH_PHASES = [
  "health.total", "health.ready", "health.snapshot", "health.database", "health.atc",
  "health.atc.db-query", "health.atc.data-transformation", "health.atc.metadata-assembly", "health.event-loop",
] as const;

function metric(value: Record<string, unknown> | undefined) {
  if (!value) return null;
  return {
    calls: value.calls, avgMs: value.avgMs, maxMs: value.maxMs,
    p50Ms: value.p50Ms, p95Ms: value.p95Ms, p99Ms: value.p99Ms,
    cpuMs: value.cpuMs, waitMs: value.waitMs, windows: value.windows,
  };
}

export function toPublicRuntimePerformance(metrics: Record<string, unknown>) {
  const phases = Object.fromEntries(HEALTH_PHASES.map((name) => [name, metric(metrics[name] as Record<string, unknown> | undefined)]));
  const runtime = (metrics.runtime ?? {}) as Record<string, unknown>;
  return {
    schemaVersion: 1,
    scope: "process-local",
    phases,
    runtime: {
      status: runtime.status,
      heapUsedBytes: runtime.heapUsedBytes, heapTotalBytes: runtime.heapTotalBytes,
      rssBytes: runtime.rssBytes, externalBytes: runtime.externalBytes, arrayBuffersBytes: runtime.arrayBuffersBytes,
      cpuIntervalPercent: runtime.cpuIntervalPercent,
      eventLoopLagP50Ms: runtime.eventLoopLagP50Ms, eventLoopLagP95Ms: runtime.eventLoopLagP95Ms,
      eventLoopLagP99Ms: runtime.eventLoopLagP99Ms, eventLoopLagWindows: runtime.eventLoopLagWindows,
      gcSampleCount: runtime.gcSampleCount, gcCount: runtime.gcCount,
      gcTotalPauseMs: runtime.gcTotalPauseMs, gcMaxPauseMs: runtime.gcMaxPauseMs,
      gcAveragePauseMs: runtime.gcAveragePauseMs,
    },
  };
}

export function toPublicRuntimeHistory(history: RuntimeTelemetryHistory) {
  return {
    schemaVersion: history.schemaVersion,
    intervalMs: history.intervalMs,
    retentionMs: history.retentionMs,
    samples: history.samples.map((sample) => {
      const publicSample = { ...sample };
      delete publicSample.processId;
      return publicSample;
    }),
  };
}

type DiagnosticRecord = Record<string, unknown>;
function object(value: unknown): DiagnosticRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DiagnosticRecord : {};
}

export function toPublicIntegrationDiagnostics(value: DiagnosticRecord) {
  const rxw = object(value.rxw);
  const adsbhub = object(value.adsbhub);
  const hasAdsbHub = value.adsbhub !== null && value.adsbhub !== undefined;
  const route = object(value.route);
  const navigation = object(value.navigation);
  const providers = object(object(value.routeProviders).postgres);
  return {
    rxw: {
      enabled: rxw.enabled, fpnEnabled: rxw.fpnEnabled, connection: rxw.connection,
      receivedEvents: rxw.receivedEvents, receivedItems: rxw.receivedItems, accepted: rxw.accepted,
      rejectedInvalid: rxw.rejectedInvalid, rejectedDuplicate: rxw.rejectedDuplicate,
      unsupportedPayloads: rxw.unsupportedPayloads, plans: rxw.plans,
      fpnAccepted: rxw.fpnAccepted, fpnRejected: rxw.fpnRejected,
      connectCount: rxw.connectCount, disconnectCount: rxw.disconnectCount, connectionErrors: rxw.connectionErrors,
      lastEventAt: rxw.lastEventAt, lastAcceptedAt: rxw.lastAcceptedAt,
    },
    adsbhub: hasAdsbHub ? {
      enabled: adsbhub.enabled, status: adsbhub.status, connected: adsbhub.connected,
      lastLineAt: adsbhub.lastLineAt, linesReceived: adsbhub.linesReceived, linesParsed: adsbhub.linesParsed,
      malformedLines: adsbhub.malformedLines, invalidIcao: adsbhub.invalidIcao,
      invalidPosition: adsbhub.invalidPosition, reconnects: adsbhub.reconnects, activeTracks: adsbhub.activeTracks,
    } : null,
    networkSourceValue: value.networkSourceValue,
    databaseLatency: value.databaseLatency,
    routeCacheLatency: value.routeCacheLatency,
    routeProviders: { postgres: {
      timeouts: providers.timeouts, queryFailures: providers.queryFailures,
      connectionFailures: providers.connectionFailures, bypassBackoff: providers.bypassBackoff,
      bypassConcurrency: providers.bypassConcurrency, bypassUnconfigured: providers.bypassUnconfigured,
      lastFailureAt: providers.lastFailureAt,
    } },
    route: {
      enabled: route.enabled, dbHit: route.dbHit, dbMiss: route.dbMiss, dbError: route.dbError,
      dbBypassed: route.dbBypassed, dbWrite: route.dbWrite, validEntries: route.validEntries,
      telemetryFailures: route.telemetryFailures, lastSavedAt: route.lastSavedAt,
    },
    navigation: {
      observationsCreated: navigation.observationsCreated,
      rejectedInvalidOrStale: navigation.rejectedInvalidOrStale,
      rejectionReasons: navigation.rejectionReasons,
    },
  };
}
