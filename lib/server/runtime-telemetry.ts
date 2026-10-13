import { randomUUID } from "node:crypto";
import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { chmod, mkdir, open, rename, unlink } from "node:fs/promises";
import path from "node:path";
import type { NetworkProviderStatus } from "@/lib/aircraft/types";
import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { getPrisma } from "@/lib/server/db";
import { readRuntimeDiagnostics } from "@/lib/server/runtime-diagnostics";
import { getRuntimeStateDirectory } from "@/lib/server/runtime-state";
import { getRuntimeHealthObservation } from "@/lib/server/runtime-health-observation";
import { getPublicVersion } from "@/lib/server/version";
import { activeRuntimeMonitorAlerts, createRuntimeMonitorState, observeRuntimeMonitor, restoreRuntimeMonitorState, RUNTIME_MONITOR_THRESHOLDS, type RuntimeMonitorAlert, type RuntimeMonitorIncident, type RuntimeMonitorState } from "@/lib/server/runtime-monitor";

export const RUNTIME_TELEMETRY_INTERVAL_MS = 60_000;
export const RUNTIME_TELEMETRY_RETENTION_MS = 24 * 60 * 60_000;
export const RUNTIME_TELEMETRY_MAX_SAMPLES = 1_440;
export const RUNTIME_TELEMETRY_MAX_BYTES = 2 * 1024 * 1024;

export interface RuntimeTelemetrySample {
  recordedAt: string;
  processRssBytes: number;
  heapUsedBytes: number;
  cgroupMemoryCurrentBytes: number | null;
  activeSseClients: number;
  aircraftCount: number | null;
  listenerCount: number | null;
  databaseState: "ok" | "offline" | "disabled";
  databaseLatencyMs: number | null;
  localProviderState: "online" | "offline";
  networkProviderState: NetworkProviderStatus;
  processId?: number | null;
  processUptimeSeconds?: number | null;
  applicationVersion?: string | null;
  applicationCommit?: string | null;
  processCpuPercent?: number | null;
  eventLoopP50Ms?: number | null;
  eventLoopP95Ms?: number | null;
  eventLoopP99Ms?: number | null;
  eventLoopMaxMs?: number | null;
  timerCallbackOvershootP95Ms?: number | null;
  majorGcCount?: number | null;
  gcTotalPauseMs?: number | null;
  databaseCallP95Ms?: number | null;
  databaseCallTimeouts?: number | null;
  databaseCallFailures?: number | null;
  routeCacheCircuitOpen?: boolean | null;
  historyPersistP95Ms?: number | null;
  historyTransactionP95Ms?: number | null;
  networkMetadataP95Ms?: number | null;
  atcResolveP95Ms?: number | null;
  snapshotApplyP95Ms?: number | null;
  operationalTwinP95Ms?: number | null;
  twinEventOutcomeLocalP95Ms?: number | null;
  localAircraftRetained?: number | null;
  networkAircraftRetained?: number | null;
  trailPointsRetained?: number | null;
  pendingTrackFusion?: number | null;
}

export interface RuntimeTelemetryHistory {
  schemaVersion: 1;
  intervalMs: number;
  retentionMs: number;
  samples: RuntimeTelemetrySample[];
  monitor: {
    thresholds: {
      cpuP95Percent: number;
      eventLoopP99Ms: number;
      databaseCallP95Ms: number;
      circuitOpenFraction: number;
      availabilityPercent: number;
    };
    state: RuntimeMonitorState;
    activeAlerts: RuntimeMonitorAlert[];
    incidents: RuntimeMonitorIncident[];
  };
  diagnostics: {
    file: string;
    loadedFromDisk: boolean;
    lastLoadError: string | null;
    lastSaveAt: string | null;
    lastSaveError: string | null;
  };
}

interface RuntimeTelemetryFile {
  schemaVersion: 1;
  savedAt: string;
  samples: RuntimeTelemetrySample[];
  monitor?: RuntimeMonitorState;
}

export interface RuntimeTelemetryStoreOptions {
  file?: string;
  now?: () => number;
  sample?: () => RuntimeTelemetrySample | Promise<RuntimeTelemetrySample>;
  intervalMs?: number;
  retentionMs?: number;
  maxSamples?: number;
  maxBytes?: number;
}

function finiteNonNegative(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : null;
}

function finiteNonNegativeDecimal(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function nullableNonNegative(value: unknown): number | null | undefined {
  if (value === null) return null;
  return finiteNonNegativeDecimal(value) ?? undefined;
}

const OPTIONAL_NUMBER_FIELDS = [
  "processId", "processUptimeSeconds", "processCpuPercent", "eventLoopP50Ms", "eventLoopP95Ms", "eventLoopP99Ms", "eventLoopMaxMs",
  "timerCallbackOvershootP95Ms", "majorGcCount", "gcTotalPauseMs", "databaseCallP95Ms", "databaseCallTimeouts", "databaseCallFailures",
  "historyPersistP95Ms", "historyTransactionP95Ms", "networkMetadataP95Ms", "atcResolveP95Ms", "snapshotApplyP95Ms", "operationalTwinP95Ms",
  "twinEventOutcomeLocalP95Ms", "localAircraftRetained", "networkAircraftRetained", "trailPointsRetained", "pendingTrackFusion",
] as const;
const OPTIONAL_STRING_FIELDS = ["applicationVersion", "applicationCommit"] as const;

function validSample(value: unknown, now: number, retentionMs: number): RuntimeTelemetrySample | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.recordedAt !== "string") return null;
  const recordedAt = Date.parse(candidate.recordedAt);
  if (!Number.isFinite(recordedAt) || recordedAt > now + 60_000 || now - recordedAt > retentionMs) return null;
  const processRssBytes = finiteNonNegative(candidate.processRssBytes);
  const heapUsedBytes = finiteNonNegative(candidate.heapUsedBytes);
  const activeSseClients = finiteNonNegative(candidate.activeSseClients);
  const cgroupMemoryCurrentBytes = nullableNonNegative(candidate.cgroupMemoryCurrentBytes);
  const aircraftCount = nullableNonNegative(candidate.aircraftCount);
  const listenerCount = nullableNonNegative(candidate.listenerCount);
  const databaseLatencyMs = nullableNonNegative(candidate.databaseLatencyMs);
  const databaseState = candidate.databaseState;
  const localProviderState = candidate.localProviderState;
  const networkProviderState = candidate.networkProviderState;
  const validNetworkStates = new Set<NetworkProviderStatus>([
    "disabled", "connecting", "disconnected", "degraded", "online", "stale",
    "timeout", "rate_limited", "http_error", "invalid_response",
  ]);
  if (
    processRssBytes === null
    || heapUsedBytes === null
    || activeSseClients === null
    || cgroupMemoryCurrentBytes === undefined
    || aircraftCount === undefined
    || listenerCount === undefined
    || databaseLatencyMs === undefined
    || (databaseState !== "ok" && databaseState !== "offline" && databaseState !== "disabled")
    || (localProviderState !== "online" && localProviderState !== "offline")
    || typeof networkProviderState !== "string"
    || !validNetworkStates.has(networkProviderState as NetworkProviderStatus)
  ) return null;
  const result: RuntimeTelemetrySample = {
    recordedAt: new Date(recordedAt).toISOString(),
    processRssBytes,
    heapUsedBytes,
    cgroupMemoryCurrentBytes,
    activeSseClients,
    aircraftCount,
    listenerCount,
    databaseState,
    databaseLatencyMs,
    localProviderState,
    networkProviderState: networkProviderState as NetworkProviderStatus,
  };
  for (const field of OPTIONAL_NUMBER_FIELDS) {
    if (field in candidate) result[field] = nullableNonNegative(candidate[field]);
  }
  for (const field of OPTIONAL_STRING_FIELDS) {
    if (field in candidate) result[field] = candidate[field] === null ? null : typeof candidate[field] === "string" ? candidate[field].slice(0, 80) : null;
  }
  if ("routeCacheCircuitOpen" in candidate) {
    result.routeCacheCircuitOpen = candidate.routeCacheCircuitOpen === null
      ? null
      : typeof candidate.routeCacheCircuitOpen === "boolean" ? candidate.routeCacheCircuitOpen : null;
  }
  return result;
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object") {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && /^[A-Z0-9_]+$/.test(code)) return code;
  }
  return "save_failed";
}

async function defaultSample(now = Date.now()): Promise<RuntimeTelemetrySample> {
  const service = getAircraftStateService();
  const aircraft = service.getDiagnostics();
  const snapshot = service.getSnapshot();
  const network = service.getNetworkDiagnostics();
  const runtime = readRuntimeDiagnostics({
    aircraftCount: aircraft.aircraftCount,
    listenerCount: aircraft.listenerCount,
  });
  const health = getRuntimeHealthObservation();
  const version = getPublicVersion();
  const routeMetrics = aircraft.enrichment.routeMetrics;
  const performance = aircraft.runtimePerformance;
  const p95 = (name: string): number | null => performance[name]?.p95Ms ?? null;

  const database = getPrisma();
  let databaseState: RuntimeTelemetrySample["databaseState"] = database ? "offline" : "disabled";
  let databaseLatencyMs: number | null = null;
  if (database) {
    const startedAt = Date.now();
    try {
      await database.orm.public.Aircraft.select("id").limit(1).all();
      databaseLatencyMs = Math.max(0, Date.now() - startedAt);
      databaseState = "ok";
    } catch {
      databaseLatencyMs = Math.max(0, Date.now() - startedAt);
      databaseState = "offline";
    }
  }

  return {
    recordedAt: new Date(now).toISOString(),
    processRssBytes: runtime.processRssBytes,
    heapUsedBytes: runtime.heapUsedBytes,
    cgroupMemoryCurrentBytes: runtime.cgroupMemoryCurrentBytes,
    activeSseClients: runtime.activeSseClients,
    aircraftCount: runtime.aircraftCount,
    listenerCount: runtime.listenerCount,
    databaseState,
    databaseLatencyMs,
    localProviderState: snapshot.sourceOnline ? "online" : "offline",
    networkProviderState: network.status,
    processId: process.pid,
    processUptimeSeconds: Math.max(0, Math.trunc(process.uptime())),
    applicationVersion: version.version,
    applicationCommit: version.commit,
    processCpuPercent: health.cpuIntervalPercent,
    eventLoopP50Ms: health.eventLoopLagP50Ms,
    eventLoopP95Ms: health.eventLoopLagP95Ms,
    eventLoopP99Ms: health.eventLoopLagP99Ms,
    eventLoopMaxMs: health.eventLoopLagWindows.at(-1)?.maxMs ?? null,
    timerCallbackOvershootP95Ms: routeMetrics.phases.callerTimeoutOvershoot.p95Ms,
    majorGcCount: health.majorGcCount,
    gcTotalPauseMs: health.gcTotalPauseMs,
    databaseCallP95Ms: routeMetrics.phases.dbCallSettlement.p95Ms,
    databaseCallTimeouts: routeMetrics.sql.callerTimeouts,
    databaseCallFailures: routeMetrics.totals.dbError,
    routeCacheCircuitOpen: routeMetrics.sql.circuit.state === "open",
    historyPersistP95Ms: p95("history.persist"),
    historyTransactionP95Ms: p95("history.transaction"),
    networkMetadataP95Ms: p95("network.metadata"),
    atcResolveP95Ms: p95("atc.resolve"),
    snapshotApplyP95Ms: p95("snapshot.apply.total"),
    operationalTwinP95Ms: p95("snapshot.operationalTwin"),
    twinEventOutcomeLocalP95Ms: p95("twin.eventOutcome.local"),
    localAircraftRetained: aircraft.retentionAttribution.aircraft.local.count,
    networkAircraftRetained: aircraft.retentionAttribution.aircraft.network.count,
    trailPointsRetained: aircraft.retentionAttribution.trails.local.points + aircraft.retentionAttribution.trails.network.points,
    pendingTrackFusion: aircraft.trackFusionOutcome.pending,
  };
}

export class RuntimeTelemetryStore {
  private readonly file: string;
  private readonly now: () => number;
  private readonly sampleFactory: () => RuntimeTelemetrySample | Promise<RuntimeTelemetrySample>;
  private readonly intervalMs: number;
  private readonly retentionMs: number;
  private readonly maxSamples: number;
  private readonly maxBytes: number;
  private samples: RuntimeTelemetrySample[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private saveInFlight: Promise<void> | null = null;
  private sampleInFlight: Promise<void> | null = null;
  private dirty = false;
  private loadedFromDisk = false;
  private lastLoadError: string | null = null;
  private lastSaveAt: string | null = null;
  private lastSaveError: string | null = null;
  private monitorState: RuntimeMonitorState = createRuntimeMonitorState();
  private activeAlerts: RuntimeMonitorAlert[] = [];

  constructor(options: RuntimeTelemetryStoreOptions = {}) {
    this.file = options.file ?? path.join(getRuntimeStateDirectory(), "runtime-telemetry-v1.json");
    this.now = options.now ?? Date.now;
    this.sampleFactory = options.sample ?? (() => defaultSample(this.now()));
    this.intervalMs = Math.min(15 * 60_000, Math.max(10_000, Math.trunc(options.intervalMs ?? RUNTIME_TELEMETRY_INTERVAL_MS)));
    this.retentionMs = Math.min(7 * 24 * 60 * 60_000, Math.max(this.intervalMs, Math.trunc(options.retentionMs ?? RUNTIME_TELEMETRY_RETENTION_MS)));
    this.maxSamples = Math.min(10_080, Math.max(1, Math.trunc(options.maxSamples ?? RUNTIME_TELEMETRY_MAX_SAMPLES)));
    this.maxBytes = Math.min(8 * 1024 * 1024, Math.max(64 * 1024, Math.trunc(options.maxBytes ?? RUNTIME_TELEMETRY_MAX_BYTES)));
    this.load();
  }

  start(): void {
    if (this.timer) return;
    void this.collectAndFlush();
    this.timer = setInterval(() => { void this.collectAndFlush(); }, this.intervalMs);
    this.timer.unref?.();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.sampleInFlight) await this.sampleInFlight;
    await this.flush();
  }

  private async collectAndFlush(): Promise<void> {
    if (this.sampleInFlight) return this.sampleInFlight;
    const operation = Promise.resolve(this.sampleFactory())
      .then(async (sample) => {
        this.record(sample);
        await this.flush();
      })
      .catch((error) => {
        this.recordUnavailable();
        void this.flush();
        console.warn(`[runtime-telemetry] sample failed: ${errorCode(error)}`);
      });
    const tracked = operation.finally(() => {
      if (this.sampleInFlight === tracked) this.sampleInFlight = null;
    });
    this.sampleInFlight = tracked;
    return tracked;
  }

  record(sample: RuntimeTelemetrySample): void {
    const now = this.now();
    const valid = validSample(sample, now, this.retentionMs);
    if (!valid) return;
    this.samples.push(valid);
    this.prune(now);
    const evaluation = observeRuntimeMonitor(this.monitorState, this.samples, valid, true, now);
    this.monitorState = evaluation.state;
    this.activeAlerts = evaluation.alerts;
    this.dirty = true;
  }

  private recordUnavailable(): void {
    const now = this.now();
    const evaluation = observeRuntimeMonitor(this.monitorState, this.samples, null, false, now);
    this.monitorState = evaluation.state;
    this.activeAlerts = evaluation.alerts;
    this.dirty = true;
  }

  history(): RuntimeTelemetryHistory {
    return {
      schemaVersion: 1,
      intervalMs: this.intervalMs,
      retentionMs: this.retentionMs,
      samples: this.samples.map((sample) => ({ ...sample })),
      monitor: {
        thresholds: RUNTIME_MONITOR_THRESHOLDS,
        state: { ...this.monitorState, availabilityWindow: [...this.monitorState.availabilityWindow], incidents: this.monitorState.incidents.map((incident) => ({ ...incident })) },
        activeAlerts: this.activeAlerts.map((alert) => ({ ...alert })),
        incidents: this.monitorState.incidents.map((incident) => ({ ...incident })),
      },
      diagnostics: {
        file: this.file,
        loadedFromDisk: this.loadedFromDisk,
        lastLoadError: this.lastLoadError,
        lastSaveAt: this.lastSaveAt,
        lastSaveError: this.lastSaveError,
      },
    };
  }

  async flush(): Promise<void> {
    if (this.saveInFlight) {
      await this.saveInFlight;
      if (!this.dirty) return;
    }
    if (!this.dirty) return;
    this.dirty = false;
    const save = this.writeSnapshot();
    this.saveInFlight = save;
    try {
      await save;
    } finally {
      if (this.saveInFlight === save) this.saveInFlight = null;
    }
  }

  private prune(now: number): void {
    const cutoff = now - this.retentionMs;
    this.samples = this.samples.filter((sample) => Date.parse(sample.recordedAt) >= cutoff);
    if (this.samples.length > this.maxSamples) this.samples = this.samples.slice(-this.maxSamples);
  }

  private load(): void {
    let descriptor = -1;
    let serialized = "";
    try {
      descriptor = openSync(this.file, "r");
      const size = fstatSync(descriptor).size;
      if (!Number.isSafeInteger(size) || size < 0 || size > this.maxBytes) {
        this.lastLoadError = "file_too_large";
        return;
      }
      const buffer = Buffer.alloc(this.maxBytes + 1);
      let total = 0;
      while (total < buffer.length) {
        const bytes = readSync(descriptor, buffer, total, buffer.length - total, null);
        if (bytes === 0) break;
        total += bytes;
      }
      if (total > this.maxBytes) {
        this.lastLoadError = "file_too_large";
        return;
      }
      serialized = buffer.subarray(0, total).toString("utf8");
    } catch (error) {
      if (errorCode(error) !== "ENOENT") this.lastLoadError = "read_failed";
      return;
    } finally {
      if (descriptor !== -1) {
        try { closeSync(descriptor); } catch { this.lastLoadError = "read_failed"; }
      }
    }

    let payload: unknown;
    try {
      payload = JSON.parse(serialized) as unknown;
    } catch {
      this.lastLoadError = "invalid_json";
      return;
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      this.lastLoadError = "invalid_structure";
      return;
    }
    const stored = payload as Partial<RuntimeTelemetryFile>;
    if (stored.schemaVersion !== 1 || !Array.isArray(stored.samples) || stored.samples.length > this.maxSamples) {
      this.lastLoadError = "invalid_structure";
      return;
    }
    const now = this.now();
    this.samples = stored.samples
      .map((sample) => validSample(sample, now, this.retentionMs))
      .filter((sample): sample is RuntimeTelemetrySample => sample !== null)
      .sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));
    this.monitorState = restoreRuntimeMonitorState(stored.monitor);
    this.activeAlerts = activeRuntimeMonitorAlerts(this.monitorState);
    this.prune(now);
    this.loadedFromDisk = true;
  }

  private async writeSnapshot(): Promise<void> {
    const temporaryFile = `${this.file}.tmp-${process.pid}-${randomUUID()}`;
    try {
      this.prune(this.now());
      const payload: RuntimeTelemetryFile = {
        schemaVersion: 1,
        savedAt: new Date(this.now()).toISOString(),
        samples: this.samples,
        monitor: this.monitorState,
      };
      const serialized = `${JSON.stringify(payload)}\n`;
      if (Buffer.byteLength(serialized, "utf8") > this.maxBytes) throw new Error("payload_too_large");
      await mkdir(path.dirname(this.file), { recursive: true, mode: 0o750 });
      const handle = await open(temporaryFile, "wx", 0o600);
      try {
        await handle.writeFile(serialized, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      await chmod(temporaryFile, 0o600);
      await rename(temporaryFile, this.file);
      this.lastSaveAt = new Date(this.now()).toISOString();
      this.lastSaveError = null;
    } catch (error) {
      this.dirty = true;
      this.lastSaveError = error instanceof Error && error.message === "payload_too_large" ? "payload_too_large" : errorCode(error);
      try { await unlink(temporaryFile); } catch { /* best effort */ }
      console.warn(`[runtime-telemetry] save failed: ${this.lastSaveError}`);
    }
  }
}

const globalForRuntimeTelemetry = globalThis as unknown as {
  airRadarRuntimeTelemetry?: RuntimeTelemetryStore;
};

export function getRuntimeTelemetryStore(): RuntimeTelemetryStore {
  globalForRuntimeTelemetry.airRadarRuntimeTelemetry ??= new RuntimeTelemetryStore();
  return globalForRuntimeTelemetry.airRadarRuntimeTelemetry;
}

export function startRuntimeTelemetry(): void {
  getRuntimeTelemetryStore().start();
}

export function stopRuntimeTelemetry(): Promise<void> {
  return getRuntimeTelemetryStore().stop();
}

export function getRuntimeTelemetryHistory(): RuntimeTelemetryHistory {
  return getRuntimeTelemetryStore().history();
}
