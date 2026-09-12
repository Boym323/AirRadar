import { readFileSync } from "node:fs";
import { getSseDiagnostics, MAX_SSE_CLIENTS } from "@/lib/server/sse-capacity";

export interface RuntimeDiagnostics {
  processRssBytes: number;
  processRssAnonBytes: number | null;
  processRssFileBytes: number | null;
  processPrivateDirtyBytes: number | null;
  heapUsedBytes: number;
  heapTotalBytes: number;
  externalBytes: number;
  arrayBuffersBytes: number;
  activeSseClients: number;
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
  aircraftCount: number | null;
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
}

function nonNegative(value: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0;
}

type CgroupMemoryFile = "memory.current" | "memory.max";

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
    if (controllers?.split(",").includes("memory")) candidates.push(`/sys/fs/cgroup/memory${relativePath}/${file}`);
  }
  // Keep the conventional mount points as a compatibility fallback for
  // containers and older cgroup-v1 hosts where /proc/self/cgroup is hidden.
  candidates.push(`/sys/fs/cgroup/${file}`, `/sys/fs/cgroup/memory/${file === "memory.current" ? "memory.usage_in_bytes" : "memory.limit_in_bytes"}`);
  return [...new Set(candidates)];
}

export function readRuntimeDiagnostics(extra: Partial<RuntimeDiagnostics> = {}): RuntimeDiagnostics {
  const memory = process.memoryUsage();
  const sse = getSseDiagnostics();
  return {
    processRssBytes: nonNegative(memory.rss),
    ...readProcMemory(),
    heapUsedBytes: nonNegative(memory.heapUsed),
    heapTotalBytes: nonNegative(memory.heapTotal),
    externalBytes: nonNegative(memory.external),
    arrayBuffersBytes: nonNegative(memory.arrayBuffers),
    activeSseClients: sse.activeClients,
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
    aircraftCount: null,
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
    ...extra,
  };
}
