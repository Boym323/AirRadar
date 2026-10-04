export type AircraftContinuityOrigin = "local" | "network";

export interface AircraftMassDropGuardConfig {
  enabled: boolean;
  minBaseline: number;
  dropRatio: number;
}

interface OriginCounters {
  omissionEvents: number;
  recoveredOmissions: number;
  staleExpirations: number;
  reappearedWithinWindow: number;
  massDropCandidates: number;
  massDropDeferrals: number;
  massDropConfirmed: number;
  massDropRecovered: number;
}

interface PendingMassDrop {
  baselineCount: number;
  firstObservedCount: number;
  startedAt: number;
}

export interface AircraftMassDropDecision {
  suspicious: boolean;
  deferPrune: boolean;
  confirmed: boolean;
  recovered: boolean;
  baselineCount: number;
  currentCount: number;
  dropRatio: number;
}

export interface AircraftContinuityDiagnostics {
  local: OriginCounters & {
    observedAircraft: number;
    retainedAircraft: number;
    missingTracked: number;
    massDropPending: boolean;
    pendingMassDropBaseline: number | null;
  };
  network: OriginCounters & {
    observedAircraft: number;
    retainedAircraft: number;
    missingTracked: number;
    massDropPending: boolean;
    pendingMassDropBaseline: number | null;
  };
  sourceFailovers: {
    localToNetwork: number;
    networkToLocal: number;
    pendingAffinity: number;
  };
  lastEventAt: string | null;
}

function emptyCounters(): OriginCounters {
  return {
    omissionEvents: 0,
    recoveredOmissions: 0,
    staleExpirations: 0,
    reappearedWithinWindow: 0,
    massDropCandidates: 0,
    massDropDeferrals: 0,
    massDropConfirmed: 0,
    massDropRecovered: 0,
  };
}

function ratio(baseline: number, current: number): number {
  if (baseline <= 0 || current >= baseline) return 0;
  return (baseline - current) / baseline;
}

export class AircraftContinuityGuard {
  private readonly counters: Record<AircraftContinuityOrigin, OriginCounters> = {
    local: emptyCounters(),
    network: emptyCounters(),
  };
  private readonly missingSince: Record<AircraftContinuityOrigin, Map<string, number>> = {
    local: new Map(),
    network: new Map(),
  };
  private readonly recentRemovals: Record<AircraftContinuityOrigin, Map<string, number>> = {
    local: new Map(),
    network: new Map(),
  };
  private readonly pendingMassDrop: Record<AircraftContinuityOrigin, PendingMassDrop | null> = {
    local: null,
    network: null,
  };
  private sourceFailovers = { localToNetwork: 0, networkToLocal: 0 };
  private lastEventAt: number | null = null;

  observeMembership(
    origin: AircraftContinuityOrigin,
    previousObserved: ReadonlySet<string>,
    currentObserved: ReadonlySet<string>,
    now: number,
  ): void {
    const missing = this.missingSince[origin];
    for (const hex of previousObserved) {
      if (currentObserved.has(hex) || missing.has(hex)) continue;
      missing.set(hex, now);
      this.counters[origin].omissionEvents += 1;
      this.lastEventAt = now;
    }
    for (const hex of currentObserved) {
      if (!missing.delete(hex)) continue;
      this.counters[origin].recoveredOmissions += 1;
      this.lastEventAt = now;
    }
  }

  recordObservation(origin: AircraftContinuityOrigin, hex: string, now: number, reappearWindowMs: number): void {
    const removals = this.recentRemovals[origin];
    const removedAt = removals.get(hex);
    if (removedAt !== undefined) {
      if (now >= removedAt && now - removedAt <= reappearWindowMs) {
        this.counters[origin].reappearedWithinWindow += 1;
        this.lastEventAt = now;
      }
      removals.delete(hex);
    }
    if (removals.size > 10_000) {
      const cutoff = now - reappearWindowMs;
      for (const [key, value] of removals) {
        if (value < cutoff) removals.delete(key);
      }
    }
  }

  recordRemoval(origin: AircraftContinuityOrigin, hex: string, now: number): void {
    this.counters[origin].staleExpirations += 1;
    this.missingSince[origin].delete(hex);
    this.recentRemovals[origin].set(hex, now);
    this.lastEventAt = now;
  }

  evaluateMassDrop(
    origin: AircraftContinuityOrigin,
    previousObserved: ReadonlySet<string>,
    currentObserved: ReadonlySet<string>,
    now: number,
    config: AircraftMassDropGuardConfig,
  ): AircraftMassDropDecision {
    const pending = this.pendingMassDrop[origin];
    const baselineCount = pending?.baselineCount ?? previousObserved.size;
    const currentCount = currentObserved.size;
    const observedDropRatio = ratio(baselineCount, currentCount);
    const suspicious = config.enabled
      && baselineCount >= config.minBaseline
      && currentCount < baselineCount
      && observedDropRatio >= config.dropRatio;

    if (pending) {
      if (suspicious) {
        this.pendingMassDrop[origin] = null;
        this.counters[origin].massDropConfirmed += 1;
        this.lastEventAt = now;
        return {
          suspicious: true,
          deferPrune: false,
          confirmed: true,
          recovered: false,
          baselineCount,
          currentCount,
          dropRatio: observedDropRatio,
        };
      }
      this.pendingMassDrop[origin] = null;
      this.counters[origin].massDropRecovered += 1;
      this.lastEventAt = now;
      return {
        suspicious: false,
        deferPrune: false,
        confirmed: false,
        recovered: true,
        baselineCount,
        currentCount,
        dropRatio: observedDropRatio,
      };
    }

    if (suspicious) {
      this.pendingMassDrop[origin] = {
        baselineCount,
        firstObservedCount: currentCount,
        startedAt: now,
      };
      this.counters[origin].massDropCandidates += 1;
      this.counters[origin].massDropDeferrals += 1;
      this.lastEventAt = now;
      return {
        suspicious: true,
        deferPrune: true,
        confirmed: false,
        recovered: false,
        baselineCount,
        currentCount,
        dropRatio: observedDropRatio,
      };
    }

    return {
      suspicious: false,
      deferPrune: false,
      confirmed: false,
      recovered: false,
      baselineCount,
      currentCount,
      dropRatio: observedDropRatio,
    };
  }

  recordFailover(from: AircraftContinuityOrigin, to: AircraftContinuityOrigin, now: number): void {
    if (from === to) return;
    if (from === "local") this.sourceFailovers.localToNetwork += 1;
    else this.sourceFailovers.networkToLocal += 1;
    this.lastEventAt = now;
  }

  diagnostics(input: {
    localObserved: number;
    localRetained: number;
    networkObserved: number;
    networkRetained: number;
    pendingAffinity: number;
  }): AircraftContinuityDiagnostics {
    const localPending = this.pendingMassDrop.local;
    const networkPending = this.pendingMassDrop.network;
    return {
      local: {
        ...this.counters.local,
        observedAircraft: input.localObserved,
        retainedAircraft: input.localRetained,
        missingTracked: this.missingSince.local.size,
        massDropPending: localPending !== null,
        pendingMassDropBaseline: localPending?.baselineCount ?? null,
      },
      network: {
        ...this.counters.network,
        observedAircraft: input.networkObserved,
        retainedAircraft: input.networkRetained,
        missingTracked: this.missingSince.network.size,
        massDropPending: networkPending !== null,
        pendingMassDropBaseline: networkPending?.baselineCount ?? null,
      },
      sourceFailovers: {
        ...this.sourceFailovers,
        pendingAffinity: input.pendingAffinity,
      },
      lastEventAt: this.lastEventAt === null ? null : new Date(this.lastEventAt).toISOString(),
    };
  }
}
