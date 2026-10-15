import { readFileSync } from "node:fs";
import { getSseDiagnostics, MAX_SSE_CLIENTS } from "@/lib/server/sse-capacity";
import { getDbTransactionDiagnostics, type DbTransactionDiagnosticsSnapshot } from "@/lib/server/db-transaction-diagnostics";
import { getDbOperationDiagnostics, type DbOperationDiagnosticsSnapshot } from "@/lib/server/db-operation-diagnostics";
import { getSystemStatusRequestDiagnostics } from "@/lib/server/system-status-request-diagnostics";
import type { MemoryRetentionDiagnostics } from "@/lib/server/memory-retention-diagnostics";

export interface RuntimeDiagnostics {
  transactionAttribution?: DbTransactionDiagnosticsSnapshot;
  autocommitOperationAttribution?: DbOperationDiagnosticsSnapshot;
  systemStatusRequests?: ReturnType<typeof getSystemStatusRequestDiagnostics>;
  coverageAnalytics?: Record<string, unknown>;
  processRssBytes: number;
  processRssAnonBytes: number | null;
  processRssFileBytes: number | null;
  processPrivateDirtyBytes: number | null;
  heapUsedBytes: number;
  heapTotalBytes: number;
  externalBytes: number;
  arrayBuffersBytes: number;
  activeSseClients: number;
  sseDenied: { global: number; channel: number; client: number };
  sseCoalescedAircraftSnapshots: number;
  activeSseV1Clients: number;
  activeSseV2Clients: number;
  sseClientLimit: number;
  lastV2SnapshotBytes: number | null;
  lastV2DeltaBytes: number | null;
  recentV2DeltaChanged: number;
  recentV2DeltaRemoved: number;
  recentV2DeltaSamples: number;
  recentV2DeltaAverageBytes: number | null;
  cgroupMemoryCurrentBytes: number | null;
  cgroupMemoryMaxBytes: number | null;
  cgroupCpuQuotaCores?: number | null;
  cgroupCpuNrThrottled?: number | null;
  cgroupCpuThrottledUsec?: number | null;
  aircraftCount: number | null;
  localTrailAircraftCount: number | null;
  networkTrailAircraftCount: number | null;
  localTrailPointCount: number | null;
  networkTrailPointCount: number | null;
  localTrailMaxPointsPerAircraft: number | null;
  networkTrailMaxPointsPerAircraft: number | null;
  localTrailAtLimitAircraftCount: number | null;
  networkTrailAtLimitAircraftCount: number | null;
  localTrailOverLimitAircraftCount: number | null;
  networkTrailOverLimitAircraftCount: number | null;
  trailEstimatedBytes: number | null;
  listenerCount: number | null;
  metadataHotCacheSize: number | null;
  metadataHotCacheLimit: number | null;
  metadataCatalogRecordCount: number | null;
  metadataFallbackCacheSize: number | null;
  metadataFallbackCacheLimit: number | null;
  metadataFallbackCacheBytes: number | null;
  metadataFallbackCacheBytesLimit: number | null;
  providerCacheEntries: number | null;
  providerCacheLimit: number | null;
  retentionAttribution: MemoryRetentionDiagnostics | null;
}

function nonNegative(value: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0;
}

type CgroupMemoryFile = "memory.current" | "memory.max" | "cpu.max" | "cpu.stat";

function cgroupValue(paths: string[]): number | null {
  for (const path of paths) {
    try {
      const raw = readFileSync(path, "utf8").trim();
      if (!raw || raw === "max") return raw === "max" ? null : 0;
      const value = Number(raw);
      if (Number.isSafeInteger(value) && value >= 0) return value;
    } catch {
      // cgroup files are optional outside the production service unit.
    }
  }
  return null;
}

function processCgroupText(): string | null {
  try {
    return readFileSync("/proc/self/cgroup", "utf8");
  } catch {
    return null;
  }
}

function procMemoryValue(text: string, key: string): number | null {
  const match = text.match(new RegExp(`^${key}:\\s+(\\d+)\\s+kB$`, "m"));
  if (!match) return null;
  const value = Number(match[1]) * 1024;
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function readProcMemory(): Pick<RuntimeDiagnostics, "processRssAnonBytes" | "processRssFileBytes" | "processPrivateDirtyBytes"> {
  let status: string;
  try {
    status = readFileSync("/proc/self/status", "utf8");
  } catch {
    return { processRssAnonBytes: null, processRssFileBytes: null, processPrivateDirtyBytes: null };
  }

  let processPrivateDirtyBytes: number | null = null;
  try {
    processPrivateDirtyBytes = procMemoryValue(readFileSync("/proc/self/smaps_rollup", "utf8"), "Private_Dirty");
  } catch {
    // smaps_rollup is optional in restricted containers.
  }
  return {
    processRssAnonBytes: procMemoryValue(status, "RssAnon"),
    processRssFileBytes: procMemoryValue(status, "RssFile"),
    processPrivateDirtyBytes,
  };
}

function safeCgroupPath(value: string): string | null {
  const path = value.trim();
  if (!path || !path.startsWith("/") || path.includes("..") || !/^\/[A-Za-z0-9._/-]+$/.test(path)) return null;
  return path;
}

export function cgroupFileCandidates(file: CgroupMemoryFile, cgroupText = processCgroupText()): string[] {
  const candidates: string[] = [];
  for (const line of cgroupText?.split(/\r?\n/) ?? []) {
    const [hierarchy, controllers, rawPath] = line.split(":");
    const relativePath = safeCgroupPath(rawPath ?? "");
    if (!relativePath) continue;
    if (hierarchy === "0") candidates.push(`/sys/fs/cgroup${relativePath}/${file}`);
    const controllerSet = controllers?.split(",") ?? [];
    if (controllerSet.includes("memory") && file.startsWith("memory.")) candidates.push(`/sys/fs/cgroup/memory${relativePath}/${file}`);
    if (controllerSet.includes("cpu") && file.startsWith("cpu.")) candidates.push(`/sys/fs/cgroup/cpu${relativePath}/${file}`);
  }
  // Keep the conventional mount points as a compatibility fallback for
  // containers and older cgroup-v1 hosts where /proc/self/cgroup is hidden.
  candidates.push(`/sys/fs/cgroup/${file}`);
  if (file === "memory.current" || file === "memory.max") {
    candidates.push(`/sys/fs/cgroup/memory/${file === "memory.current" ? "memory.usage_in_bytes" : "memory.limit_in_bytes"}`);
  }
  return [...new Set(candidates)];
}

function cgroupTextValue(file: "cpu.max" | "cpu.stat"): string | null {
  for (const candidate of cgroupFileCandidates(file)) {
    try {
      return readFileSync(candidate, "utf8").slice(0, 4096);
    } catch {
      // cgroup CPU controllers may be unavailable or hidden.
    }
  }
  return null;
}

function cpuCgroupDiagnostics(): Pick<RuntimeDiagnostics, "cgroupCpuQuotaCores" | "cgroupCpuNrThrottled" | "cgroupCpuThrottledUsec"> {
  const quotaText = cgroupTextValue("cpu.max")?.trim().split(/\s+/) ?? [];
  const quota = quotaText[0] === "max" ? null : Number(quotaText[0]);
  const period = Number(quotaText[1]);
  const quotaCores = quota !== null && Number.isFinite(quota) && quota >= 0 && Number.isFinite(period) && period > 0
    ? quota / period : null;
  const stat = cgroupTextValue("cpu.stat") ?? "";
  const statValue = (name: string) => {
    const match = stat.match(new RegExp(`^${name}\\s+(\\d+)$`, "m"));
    return match ? Number(match[1]) : null;
  };
  const nrThrottled = statValue("nr_throttled");
  const throttledUsec = statValue("throttled_usec");
  return {
    cgroupCpuQuotaCores: quotaCores,
    cgroupCpuNrThrottled: Number.isSafeInteger(nrThrottled) && nrThrottled! >= 0 ? nrThrottled : null,
    cgroupCpuThrottledUsec: Number.isSafeInteger(throttledUsec) && throttledUsec! >= 0 ? throttledUsec : null,
  };
}

export function readRuntimeDiagnostics(extra: Partial<RuntimeDiagnostics> = {}): RuntimeDiagnostics {
  const memory = process.memoryUsage();
  const sse = getSseDiagnostics();
  return {
    transactionAttribution: getDbTransactionDiagnostics(),
    autocommitOperationAttribution: getDbOperationDiagnostics(),
    systemStatusRequests: getSystemStatusRequestDiagnostics(),
    processRssBytes: nonNegative(memory.rss),
    ...readProcMemory(),
    heapUsedBytes: nonNegative(memory.heapUsed),
    heapTotalBytes: nonNegative(memory.heapTotal),
    externalBytes: nonNegative(memory.external),
    arrayBuffersBytes: nonNegative(memory.arrayBuffers),
    activeSseClients: sse.activeClients,
    sseDenied: sse.deniedSse,
    sseCoalescedAircraftSnapshots: sse.coalescedAircraftSnapshots,
    activeSseV1Clients: sse.activeV1Clients,
    activeSseV2Clients: sse.activeV2Clients,
    sseClientLimit: MAX_SSE_CLIENTS,
    lastV2SnapshotBytes: sse.lastV2SnapshotBytes,
    lastV2DeltaBytes: sse.lastV2DeltaBytes,
    recentV2DeltaChanged: sse.recentDeltaChanged,
    recentV2DeltaRemoved: sse.recentDeltaRemoved,
    recentV2DeltaSamples: sse.recentDeltaSamples,
    recentV2DeltaAverageBytes: sse.recentDeltaAverageBytes,
    cgroupMemoryCurrentBytes: cgroupValue(cgroupFileCandidates("memory.current")),
    cgroupMemoryMaxBytes: cgroupValue(cgroupFileCandidates("memory.max")),
    ...cpuCgroupDiagnostics(),
    aircraftCount: null,
    localTrailAircraftCount: null,
    networkTrailAircraftCount: null,
    localTrailPointCount: null,
    networkTrailPointCount: null,
    localTrailMaxPointsPerAircraft: null,
    networkTrailMaxPointsPerAircraft: null,
    localTrailAtLimitAircraftCount: null,
    networkTrailAtLimitAircraftCount: null,
    localTrailOverLimitAircraftCount: null,
    networkTrailOverLimitAircraftCount: null,
    trailEstimatedBytes: null,
    listenerCount: null,
    metadataHotCacheSize: null,
    metadataHotCacheLimit: null,
    metadataCatalogRecordCount: null,
    metadataFallbackCacheSize: null,
    metadataFallbackCacheLimit: null,
    metadataFallbackCacheBytes: null,
    metadataFallbackCacheBytesLimit: null,
    providerCacheEntries: null,
    providerCacheLimit: null,
    retentionAttribution: null,
    ...extra,
  };
}
