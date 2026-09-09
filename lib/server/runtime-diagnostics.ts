import { readFileSync } from "node:fs";
import { getActiveSseClientCount, MAX_SSE_CLIENTS } from "@/lib/server/sse-capacity";

export interface RuntimeDiagnostics {
  processRssBytes: number;
  heapUsedBytes: number;
  heapTotalBytes: number;
  externalBytes: number;
  arrayBuffersBytes: number;
  activeSseClients: number;
  sseClientLimit: number;
  cgroupMemoryCurrentBytes: number | null;
  cgroupMemoryMaxBytes: number | null;
  aircraftCount: number | null;
  listenerCount: number | null;
  metadataHotCacheSize: number | null;
  metadataHotCacheLimit: number | null;
  metadataCatalogRecordCount: number | null;
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
  return {
    processRssBytes: nonNegative(memory.rss),
    heapUsedBytes: nonNegative(memory.heapUsed),
    heapTotalBytes: nonNegative(memory.heapTotal),
    externalBytes: nonNegative(memory.external),
    arrayBuffersBytes: nonNegative(memory.arrayBuffers),
    activeSseClients: getActiveSseClientCount(),
    sseClientLimit: MAX_SSE_CLIENTS,
    cgroupMemoryCurrentBytes: cgroupValue(cgroupFileCandidates("memory.current")),
    cgroupMemoryMaxBytes: cgroupValue(cgroupFileCandidates("memory.max")),
    aircraftCount: null,
    listenerCount: null,
    metadataHotCacheSize: null,
    metadataHotCacheLimit: null,
    metadataCatalogRecordCount: null,
    providerCacheEntries: null,
    providerCacheLimit: null,
    ...extra,
  };
}
