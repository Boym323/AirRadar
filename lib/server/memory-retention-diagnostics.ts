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

export interface TrailLimitCounters {
  atLimitAircraftCount: number;
  overLimitAircraftCount: number;
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

function retentionSummaries(
  items: Iterable<Aircraft>,
  now: number,
  aircraftStaleAfterMs: number,
  trailStaleAfterMs: number,
  trailLimitPoints?: number,
): { aircraft: RetentionAgeSummary; trail: TrailRetentionSummary; limits: TrailLimitCounters } {
  let aircraftCount = 0;
  let oldestAircraftAtMs: number | null = null;
  let staleAircraft = 0;
  let points = 0;
  let maxPointsPerAircraft = 0;
  let oldestTrailAtMs: number | null = null;
  let staleTrail = 0;
  let atLimitAircraftCount = 0;
  let overLimitAircraftCount = 0;

  // One pass over each aircraft collection. The same samples feed two
  // independent retention windows, preserving their previous semantics.
  for (const item of items) {
    aircraftCount += 1;
    const observedAt = Date.parse(item.lastSeen);
    if (Number.isFinite(observedAt)) {
      oldestAircraftAtMs = oldestAircraftAtMs === null ? observedAt : Math.min(oldestAircraftAtMs, observedAt);
      if (now - observedAt > aircraftStaleAfterMs) staleAircraft += 1;
    }

    maxPointsPerAircraft = Math.max(maxPointsPerAircraft, item.trail.length);
    if (trailLimitPoints !== undefined) {
      if (item.trail.length === trailLimitPoints) atLimitAircraftCount += 1;
      if (item.trail.length > trailLimitPoints) overLimitAircraftCount += 1;
    }
    for (const point of item.trail) {
      points += 1;
      const recordedAt = Date.parse(point.recordedAt);
      if (!Number.isFinite(recordedAt)) continue;
      oldestTrailAtMs = oldestTrailAtMs === null ? recordedAt : Math.min(oldestTrailAtMs, recordedAt);
      if (now - recordedAt > trailStaleAfterMs) staleTrail += 1;
    }
  }

  return {
    aircraft: {
      count: aircraftCount,
      oldestObservedAt: oldestAircraftAtMs === null ? null : new Date(oldestAircraftAtMs).toISOString(),
      oldestAgeMs: oldestAircraftAtMs === null ? null : Math.max(0, now - oldestAircraftAtMs),
      staleRetained: staleAircraft,
    },
    trail: {
      count: points,
      points,
      maxPointsPerAircraft,
      oldestObservedAt: oldestTrailAtMs === null ? null : new Date(oldestTrailAtMs).toISOString(),
      oldestAgeMs: oldestTrailAtMs === null ? null : Math.max(0, now - oldestTrailAtMs),
      staleRetained: staleTrail,
    },
    limits: { atLimitAircraftCount, overLimitAircraftCount },
  };
}

export function getMemoryRetentionDiagnostics(input: {
  localAircraft: ReadonlyMap<string, Aircraft>;
  networkAircraft: ReadonlyMap<string, Aircraft>;
  localStaleAfterMs: number;
  networkStaleAfterMs: number;
  networkTrailMaxAgeMs: number;
  localTrailLimitPoints?: number;
  networkTrailLimitPoints?: number;
  sourcePreferences: ReadonlyMap<string, unknown>;
  sourcePreferenceMissingSince: ReadonlyMap<string, unknown>;
  lastHistorySample: ReadonlyMap<string, unknown>;
  predictiveEvaluatedAt: ReadonlyMap<string, unknown>;
  atcResolutionKeys: ReadonlyMap<string, unknown>;
  snapshotCacheEntries: number;
  listeners: number;
  now?: number;
}): MemoryRetentionDiagnostics & { limitCounters?: { local: TrailLimitCounters; network: TrailLimitCounters } } {
  const now = input.now ?? Date.now();
  const local = retentionSummaries(input.localAircraft.values(), now, input.localStaleAfterMs, input.localStaleAfterMs, input.localTrailLimitPoints);
  const network = retentionSummaries(input.networkAircraft.values(), now, input.networkStaleAfterMs, input.networkTrailMaxAgeMs, input.networkTrailLimitPoints);
  return {
    scope: "process-local",
    generatedAt: new Date(now).toISOString(),
    note: "bounded object-retention attribution; not a heap snapshot",
    // Optional internal counters are extracted by AircraftStateService rather than
    // adding them to the existing serialized retention-attribution contract.
    ...(input.localTrailLimitPoints === undefined || input.networkTrailLimitPoints === undefined
      ? {} : { limitCounters: { local: local.limits, network: network.limits } }),
    aircraft: {
      local: local.aircraft,
      network: network.aircraft,
    },
    trails: {
      local: local.trail,
      network: network.trail,
    },
    auxiliaryMaps: {
      sourcePreferences: input.sourcePreferences.size,
      sourcePreferenceMissingSince: input.sourcePreferenceMissingSince.size,
      lastHistorySample: input.lastHistorySample.size,
      predictiveEvaluatedAt: input.predictiveEvaluatedAt.size,
      atcResolutionKeys: input.atcResolutionKeys.size,
    },
    snapshotCacheEntries: input.snapshotCacheEntries,
    listeners: input.listeners,
  };
}
