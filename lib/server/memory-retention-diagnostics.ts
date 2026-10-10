import type { Aircraft } from "@/lib/aircraft/types";

export interface RetentionAgeSummary {
  count: number;
  oldestObservedAt: string | null;
  oldestAgeMs: number | null;
  staleRetained: number;
}

export interface TrailRetentionSummary extends RetentionAgeSummary {
  points: number;
  maxPointsPerAircraft: number;
}

export interface MemoryRetentionDiagnostics {
  scope: "process-local";
  generatedAt: string;
  note: "bounded object-retention attribution; not a heap snapshot";
  aircraft: {
    local: RetentionAgeSummary;
    network: RetentionAgeSummary;
  };
  trails: {
    local: TrailRetentionSummary;
    network: TrailRetentionSummary;
  };
  auxiliaryMaps: Record<string, number>;
  snapshotCacheEntries: number;
  listeners: number;
}

function ageSummary(items: Iterable<Aircraft>, now: number, staleAfterMs: number): RetentionAgeSummary {
  let count = 0;
  let oldestObservedAtMs: number | null = null;
  let staleRetained = 0;
  for (const item of items) {
    count += 1;
    const observedAt = Date.parse(item.lastSeen);
    if (!Number.isFinite(observedAt)) continue;
    oldestObservedAtMs = oldestObservedAtMs === null ? observedAt : Math.min(oldestObservedAtMs, observedAt);
    if (now - observedAt > staleAfterMs) staleRetained += 1;
  }
  return {
    count,
    oldestObservedAt: oldestObservedAtMs === null ? null : new Date(oldestObservedAtMs).toISOString(),
    oldestAgeMs: oldestObservedAtMs === null ? null : Math.max(0, now - oldestObservedAtMs),
    staleRetained,
  };
}

function trailSummary(items: Iterable<Aircraft>, now: number, staleAfterMs: number): TrailRetentionSummary {
  let points = 0;
  let maxPointsPerAircraft = 0;
  let oldestObservedAtMs: number | null = null;
  let staleRetained = 0;
  for (const item of items) {
    maxPointsPerAircraft = Math.max(maxPointsPerAircraft, item.trail.length);
    for (const point of item.trail) {
      points += 1;
      const recordedAt = Date.parse(point.recordedAt);
      if (!Number.isFinite(recordedAt)) continue;
      oldestObservedAtMs = oldestObservedAtMs === null ? recordedAt : Math.min(oldestObservedAtMs, recordedAt);
      if (now - recordedAt > staleAfterMs) staleRetained += 1;
    }
  }
  return {
    count: points,
    points,
    maxPointsPerAircraft,
    oldestObservedAt: oldestObservedAtMs === null ? null : new Date(oldestObservedAtMs).toISOString(),
    oldestAgeMs: oldestObservedAtMs === null ? null : Math.max(0, now - oldestObservedAtMs),
    staleRetained,
  };
}

export function getMemoryRetentionDiagnostics(input: {
  localAircraft: ReadonlyMap<string, Aircraft>;
  networkAircraft: ReadonlyMap<string, Aircraft>;
  localStaleAfterMs: number;
  networkStaleAfterMs: number;
  networkTrailMaxAgeMs: number;
  sourcePreferences: ReadonlyMap<string, unknown>;
  sourcePreferenceMissingSince: ReadonlyMap<string, unknown>;
  lastHistorySample: ReadonlyMap<string, unknown>;
  predictiveEvaluatedAt: ReadonlyMap<string, unknown>;
  atcResolutionKeys: ReadonlyMap<string, unknown>;
  atcShadowPredictionKeys: ReadonlyMap<string, unknown>;
  snapshotCacheEntries: number;
  listeners: number;
  now?: number;
}): MemoryRetentionDiagnostics {
  const now = input.now ?? Date.now();
  return {
    scope: "process-local",
    generatedAt: new Date(now).toISOString(),
    note: "bounded object-retention attribution; not a heap snapshot",
    aircraft: {
      local: ageSummary(input.localAircraft.values(), now, input.localStaleAfterMs),
      network: ageSummary(input.networkAircraft.values(), now, input.networkStaleAfterMs),
    },
    trails: {
      local: trailSummary(input.localAircraft.values(), now, input.localStaleAfterMs),
      network: trailSummary(input.networkAircraft.values(), now, input.networkTrailMaxAgeMs),
    },
    auxiliaryMaps: {
      sourcePreferences: input.sourcePreferences.size,
      sourcePreferenceMissingSince: input.sourcePreferenceMissingSince.size,
      lastHistorySample: input.lastHistorySample.size,
      predictiveEvaluatedAt: input.predictiveEvaluatedAt.size,
      atcResolutionKeys: input.atcResolutionKeys.size,
      atcShadowPredictionKeys: input.atcShadowPredictionKeys.size,
    },
    snapshotCacheEntries: input.snapshotCacheEntries,
    listeners: input.listeners,
  };
}
