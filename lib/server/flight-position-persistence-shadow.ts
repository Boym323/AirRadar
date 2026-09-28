import {
  DEFAULT_FLIGHT_POSITION_POLICY_CONTEXT,
  makeFlightPositionPolicySample,
  shouldPersistFlightPosition,
  type FlightPositionCandidate,
  type FlightPositionPolicyContext,
} from "@/lib/server/flight-position-persistence-policy";

const MAX_STATES = 10_000;
const WINDOW_MS = 60 * 60_000;
const BUCKET_MS = 60_000;
const MIN_RATE_SAMPLE = 20;

type Counts = { positionsSeen: number; currentPersist: number; currentSkip: number; shadowPersist: number; shadowSkip: number; bothPersist: number; bothSkip: number; currentPersistShadowSkip: number; currentSkipShadowPersist: number };
type State = { sample: ReturnType<typeof makeFlightPositionPolicySample>; lastSeenAt: number };
type Bucket = Counts & { at: number };

const zero = (): Counts => ({ positionsSeen: 0, currentPersist: 0, currentSkip: 0, shadowPersist: 0, shadowSkip: 0, bothPersist: 0, bothSkip: 0, currentPersistShadowSkip: 0, currentSkipShadowPersist: 0 });
const add = (a: Counts, b: Counts): void => { for (const key of Object.keys(b) as Array<keyof Counts>) a[key] += b[key]; };

export interface FlightPositionPersistenceShadowDiagnostics extends Counts {
  enabled: boolean; startedAt: string; shadowFailures: number; stateEntries: number; maximumObservedEntries: number;
  currentPersistRate: number | null; shadowPersistRate: number | null; estimatedWriteReductionPct: number | null;
  decisionMatrix: { currentPersistShadowPersist: number; currentPersistShadowSkip: number; currentSkipShadowPersist: number; currentSkipShadowSkip: number };
  reasonHistogram: Record<string, number>; contextHistogram: Record<string, number>;
  windowedRates: { minutes: number; counts: Counts; currentPersistRate: number | null; shadowPersistRate: number | null; estimatedWriteReductionPct: number | null }[];
}

export class FlightPositionPersistenceShadow {
  private readonly states = new Map<string, State>();
  private readonly lifetime = zero();
  private readonly reasonHistogram: Record<string, number> = {};
  private readonly contextHistogram: Record<string, number> = {};
  private readonly buckets: Bucket[] = [];
  private readonly startedAt = new Date().toISOString();
  private maximumObservedEntries = 0;
  private shadowFailures = 0;
  constructor(private readonly enabled = process.env.FLIGHT_POSITION_SHADOW_ENABLED?.trim().toLowerCase() === "true", private readonly context: FlightPositionPolicyContext = DEFAULT_FLIGHT_POSITION_POLICY_CONTEXT) {}

  observe(input: { aircraftHex: string; candidate: FlightPositionCandidate; currentPersist: boolean; nowMs?: number }): void {
    if (!this.enabled) return;
    const now = input.nowMs ?? Date.now();
    try {
      const state = this.states.get(input.aircraftHex);
      const decision = shouldPersistFlightPosition(state?.sample ?? null, input.candidate, this.context);
      const row: Counts = { ...zero(), positionsSeen: 1, currentPersist: input.currentPersist ? 1 : 0, currentSkip: input.currentPersist ? 0 : 1, shadowPersist: decision.persist ? 1 : 0, shadowSkip: decision.persist ? 0 : 1, bothPersist: input.currentPersist && decision.persist ? 1 : 0, bothSkip: !input.currentPersist && !decision.persist ? 1 : 0, currentPersistShadowSkip: input.currentPersist && !decision.persist ? 1 : 0, currentSkipShadowPersist: !input.currentPersist && decision.persist ? 1 : 0 };
      add(this.lifetime, row);
      this.reasonHistogram[decision.reason] = (this.reasonHistogram[decision.reason] ?? 0) + 1;
      const phase = input.candidate.airportProximity || input.candidate.phase === "airport" || input.candidate.phase === "approach" ? "airport-proximity" : input.candidate.phase === "climb" ? "climbing" : input.candidate.phase === "descent" ? "descending" : input.candidate.phase === "cruise" ? "stable" : "unknown";
      this.contextHistogram[phase] = (this.contextHistogram[phase] ?? 0) + 1;
      if (decision.persist) this.states.set(input.aircraftHex, { sample: makeFlightPositionPolicySample(input.candidate), lastSeenAt: now });
      else if (state) state.lastSeenAt = now;
      this.maximumObservedEntries = Math.max(this.maximumObservedEntries, this.states.size);
      while (this.states.size > MAX_STATES) { const oldest = [...this.states.entries()].sort((a, b) => a[1].lastSeenAt - b[1].lastSeenAt)[0]?.[0]; if (!oldest) break; this.states.delete(oldest); }
      this.recordBucket(row, now);
    } catch { this.shadowFailures += 1; }
  }

  cleanup(activeAircraftHexes: Iterable<string>, nowMs = Date.now()): void { if (!this.enabled) return; const active = new Set(activeAircraftHexes); for (const [hex, state] of this.states) if (!active.has(hex) && nowMs - state.lastSeenAt > WINDOW_MS) this.states.delete(hex); }
  private recordBucket(row: Counts, now: number): void { const at = Math.floor(now / BUCKET_MS) * BUCKET_MS; let bucket = this.buckets.at(-1); if (!bucket || bucket.at !== at) { bucket = { ...zero(), at }; this.buckets.push(bucket); } add(bucket, row); while (this.buckets.length && now - this.buckets[0].at >= WINDOW_MS) this.buckets.shift(); }
  private rate(count: number, total: number): number | null { return total >= MIN_RATE_SAMPLE ? count / total : null; }
  private window(minutes: number): Counts { const result = zero(); const cutoff = Date.now() - minutes * 60_000; for (const bucket of this.buckets) if (bucket.at >= cutoff) add(result, bucket); return result; }
  private summary(counts: Counts) { const current = this.rate(counts.currentPersist, counts.positionsSeen); const shadow = this.rate(counts.shadowPersist, counts.positionsSeen); return { currentPersistRate: current, shadowPersistRate: shadow, estimatedWriteReductionPct: current === null || shadow === null ? null : Math.max(0, (current - shadow) / Math.max(current, Number.EPSILON) * 100) }; }
  diagnostics(): FlightPositionPersistenceShadowDiagnostics { const summary = this.summary(this.lifetime); return { ...this.lifetime, enabled: this.enabled, startedAt: this.startedAt, shadowFailures: this.shadowFailures, stateEntries: this.states.size, maximumObservedEntries: this.maximumObservedEntries, ...summary, decisionMatrix: { currentPersistShadowPersist: this.lifetime.bothPersist, currentPersistShadowSkip: this.lifetime.currentPersistShadowSkip, currentSkipShadowPersist: this.lifetime.currentSkipShadowPersist, currentSkipShadowSkip: this.lifetime.bothSkip }, reasonHistogram: { ...this.reasonHistogram }, contextHistogram: { ...this.contextHistogram }, windowedRates: [5, 15, 60].map((minutes) => { const counts = this.window(minutes); return { minutes, counts, ...this.summary(counts) }; }) }; }
}

export const flightPositionPersistenceShadow = new FlightPositionPersistenceShadow();
