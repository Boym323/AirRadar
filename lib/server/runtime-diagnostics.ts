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
    cgroupMemoryCurrentBytes: cgroupValue(["/sys/fs/cgroup/memory.current", "/sys/fs/cgroup/memory/memory.usage_in_bytes"]),
    cgroupMemoryMaxBytes: cgroupValue(["/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"]),
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
