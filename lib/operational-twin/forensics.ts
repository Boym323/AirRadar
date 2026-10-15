import { performance } from "node:perf_hooks";

export const OPERATIONAL_TWIN_FORENSIC_PHASES = [
  "truthInputFingerprint", "truthPoints", "truthStateDiff", "pendingTraversal",
  "pendingTruthEvaluation", "spatialTruthMatches", "atcContextComputation",
  "atcCacheOperations", "expiryHeap", "capacityEviction", "cleanup",
] as const;

export type OperationalTwinForensicPhase = typeof OPERATIONAL_TWIN_FORENSIC_PHASES[number];

type PhaseCounters = {
  calls: number;
  sampledCalls: number;
  sampledCpuMs: number;
  sampledWallMs: number;
  maxWallMs: number;
  maxCpuMs: number;
  samples: number[];
  cpuSamples: number[];
};

const SAMPLE_EVERY = 256;
const MAX_LATENCY_SAMPLES = 128;
const MAX_WINDOWS = 30;

function emptyPhase(): PhaseCounters {
  return { calls: 0, sampledCalls: 0, sampledCpuMs: 0, sampledWallMs: 0, maxWallMs: 0, maxCpuMs: 0, samples: [], cpuSamples: [] };
}

function percentile(values: readonly number[], p: number): number | null {
  if (values.length < 20) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] ?? null;
}

/** Process local, opt-in, bounded diagnostics. No aircraft values enter this store. */
export class OperationalTwinForensics {
  readonly enabled: boolean;
  private readonly phases = new Map<OperationalTwinForensicPhase, PhaseCounters>(
    OPERATIONAL_TWIN_FORENSIC_PHASES.map((name) => [name, emptyPhase()]),
  );
  private readonly windows: Array<{ from: string; phases: Map<OperationalTwinForensicPhase, PhaseCounters>; counters: Record<string, number> }> = [];
  private scalarCursor = 0;

  constructor(enabled = process.env.AIRRADAR_OPERATIONAL_TWIN_FORENSICS_ENABLED?.trim().toLowerCase() === "true") {
    this.enabled = enabled;
  }

  measure<T>(name: OperationalTwinForensicPhase, operation: () => T): T {
    if (!this.enabled) return operation();
    const lifetime = this.phases.get(name)!;
    lifetime.calls += 1;
    if (lifetime.calls % SAMPLE_EVERY !== 0) return operation();
    const current = this.currentWindow().phases.get(name)!;
    current.calls += 1;
    const wallStarted = performance.now();
    const cpuStarted = process.cpuUsage();
    try {
      return operation();
    } finally {
      const wallMs = Math.max(0, performance.now() - wallStarted);
      const cpu = process.cpuUsage(cpuStarted);
      const cpuMs = Math.max(0, (cpu.user + cpu.system) / 1_000);
      this.record(lifetime, wallMs, cpuMs);
      this.record(current, wallMs, cpuMs);
    }
  }

  recordSnapshotInterval(intervalMs: number): void {
    if (!this.enabled || !Number.isFinite(intervalMs) || intervalMs < 0) return;
    this.observeScalar("snapshotInvocationIntervalMs", intervalMs);
  }

  recordPopulation(pending: number, pendingAircraft: number, perAircraft: readonly number[]): void {
    if (!this.enabled) return;
    this.observeScalar("pendingPopulation", pending);
    this.observeScalar("pendingAircraftPopulation", pendingAircraft);
    const buckets = this.populationBuckets;
    for (const count of perAircraft) {
      if (count <= 1) buckets.one += 1;
      else if (count === 2) buckets.two += 1;
      else if (count <= 4) buckets.threeToFour += 1;
      else if (count <= 8) buckets.fiveToEight += 1;
      else buckets.overEight += 1;
    }
  }

  increment(name: "captures" | "expirations" | "truthInvalidations" | "actualTruthResolutions"
    | "pendingCapacityEvictions" | "atcCacheEvictions" | "atcCacheExpirations"): void {
    if (!this.enabled) return;
    this.counters[name] += 1;
    this.currentWindow().counters[name] += 1;
  }

  cache(hit: boolean): void {
    if (!this.enabled) return;
    this.counters.cacheHits += hit ? 1 : 0;
    this.counters.cacheMisses += hit ? 0 : 1;
    const window = this.currentWindow();
    window.counters.cacheHits += hit ? 1 : 0;
    window.counters.cacheMisses += hit ? 0 : 1;
  }

  getBoundedSampleCount(): number {
    return [...this.phases.values()].reduce((sum, phase) => sum + phase.samples.length + phase.cpuSamples.length, 0)
      + this.windows.reduce((windowSum, window) => windowSum
        + [...window.phases.values()].reduce((sum, phase) => sum + phase.samples.length + phase.cpuSamples.length, 0), 0);
  }

  report() {
    if (!this.enabled) return { enabled: false as const };
    const summarize = (phases: Map<OperationalTwinForensicPhase, PhaseCounters>, windowed = false) =>
      Object.fromEntries(OPERATIONAL_TWIN_FORENSIC_PHASES.map((name) => {
        const item = phases.get(name)!;
        const samples = item.samples;
        return [name, {
          calls: windowed ? null : item.calls,
          estimatedCalls: windowed ? item.calls * SAMPLE_EVERY : null,
          sampledPhaseCalls: windowed ? item.calls : null,
          sampledCalls: item.sampledCalls,
          sampledCpuMs: Number(item.sampledCpuMs.toFixed(3)),
          sampledWallMs: Number(item.sampledWallMs.toFixed(3)),
          estimatedCpuMs: item.sampledCalls ? Number((sampleMeanCpu(item) * item.calls).toFixed(3)) : null,
          estimatedWallMs: item.sampledCalls ? Number((sampleMeanWall(item) * item.calls).toFixed(3)) : null,
          sampleP50Ms: percentile(samples, 0.5),
          sampleP95Ms: percentile(samples, 0.95),
          sampleP99Ms: percentile(samples, 0.99),
          sampleMaxMs: item.maxWallMs || null,
          sampleCpuP50Ms: percentile(item.cpuSamples, 0.5),
          sampleCpuP95Ms: percentile(item.cpuSamples, 0.95),
          sampleCpuP99Ms: percentile(item.cpuSamples, 0.99),
          sampleCpuMaxMs: item.maxCpuMs || null,
        }];
      }));
    return {
      enabled: true as const,
      sampling: { every: SAMPLE_EVERY, cpuLatencyReservoirPerPhase: MAX_LATENCY_SAMPLES, wallLatencyReservoirPerPhase: MAX_LATENCY_SAMPLES, percentileMinimumSamples: 20 },
      phases: summarize(this.phases),
      windows: this.windows.map((window) => ({ from: window.from, to: new Date(Date.parse(window.from) + 60_000).toISOString(), phases: summarize(window.phases, true), counters: { ...window.counters } })),
      snapshotInvocationIntervalMs: scalarReport(this.scalars.snapshotInvocationIntervalMs),
      pendingPopulation: scalarReport(this.scalars.pendingPopulation),
      pendingAircraftPopulation: scalarReport(this.scalars.pendingAircraftPopulation),
      pendingPerAircraftDistribution: { ...this.populationBuckets },
      counters: { ...this.counters },
      cacheHitRate: this.counters.cacheHits + this.counters.cacheMisses
        ? this.counters.cacheHits / (this.counters.cacheHits + this.counters.cacheMisses) : null,
      ratesPerMinute: Object.fromEntries(["captures", "expirations", "truthInvalidations", "actualTruthResolutions", "pendingCapacityEvictions", "atcCacheEvictions", "atcCacheExpirations", "cacheHits", "cacheMisses"]
        .map((name) => [name, this.windows.length ? Number((this.windows.reduce((sum, window) => sum + (window.counters[name] ?? 0), 0) / this.windows.length).toFixed(3)) : null])),
      attribution: "sampled synchronous scopes; nested phase CPU is inclusive and must not be summed",
    };
  }

  private readonly counters = { captures: 0, expirations: 0, truthInvalidations: 0, actualTruthResolutions: 0, pendingCapacityEvictions: 0, atcCacheEvictions: 0, atcCacheExpirations: 0, cacheHits: 0, cacheMisses: 0 };
  private readonly populationBuckets = { one: 0, two: 0, threeToFour: 0, fiveToEight: 0, overEight: 0 };
  private readonly scalars = {
    snapshotInvocationIntervalMs: [] as number[],
    pendingPopulation: [] as number[],
    pendingAircraftPopulation: [] as number[],
  };

  private observeScalar(name: keyof OperationalTwinForensics["scalars"], value: number): void {
    const samples = this.scalars[name];
    if (samples.length < MAX_LATENCY_SAMPLES) samples.push(value);
    else samples[this.scalarCursor++ % MAX_LATENCY_SAMPLES] = value;
  }

  private currentWindow() {
    const start = Math.floor(Date.now() / 60_000) * 60_000;
    let window = this.windows[this.windows.length - 1];
    if (!window || Date.parse(window.from) !== start) {
      window = {
        from: new Date(start).toISOString(),
        phases: new Map(OPERATIONAL_TWIN_FORENSIC_PHASES.map((name) => [name, emptyPhase()])),
        counters: { captures: 0, expirations: 0, truthInvalidations: 0, actualTruthResolutions: 0, pendingCapacityEvictions: 0, atcCacheEvictions: 0, atcCacheExpirations: 0, cacheHits: 0, cacheMisses: 0 },
      };
      this.windows.push(window);
      if (this.windows.length > MAX_WINDOWS) this.windows.shift();
    }
    return window;
  }

  private record(target: PhaseCounters, wallMs: number, cpuMs: number): void {
    target.sampledCalls += 1;
    target.sampledWallMs += wallMs;
    target.sampledCpuMs += cpuMs;
    target.maxWallMs = Math.max(target.maxWallMs, wallMs);
    target.maxCpuMs = Math.max(target.maxCpuMs, cpuMs);
    if (target.samples.length < MAX_LATENCY_SAMPLES) target.samples.push(wallMs);
    else target.samples[(target.sampledCalls - 1) % MAX_LATENCY_SAMPLES] = wallMs;
    if (target.cpuSamples.length < MAX_LATENCY_SAMPLES) target.cpuSamples.push(cpuMs);
    else target.cpuSamples[(target.sampledCalls - 1) % MAX_LATENCY_SAMPLES] = cpuMs;
  }
}

function sampleMeanCpu(item: PhaseCounters): number { return item.sampledCalls ? item.sampledCpuMs / item.sampledCalls : 0; }
function sampleMeanWall(item: PhaseCounters): number { return item.sampledCalls ? item.sampledWallMs / item.sampledCalls : 0; }
function scalarReport(values: number[]) {
  const sample = (p: number) => percentile(values, p);
  return { samples: values.length, p50: sample(0.5), p95: sample(0.95), p99: sample(0.99), max: values.length ? Math.max(...values) : null };
}
