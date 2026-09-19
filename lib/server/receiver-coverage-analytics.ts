import "temporal-polyfill/full/global";
import type { Aircraft, ReceiverPosition, NetworkProviderDiagnostics } from "@/lib/aircraft/types";
import { eligibleNetworkObservation, type CoverageEligibility } from "@/lib/aircraft/source-awareness";
import { getPrisma } from "@/lib/server/db";
import { getAircraftStaleAfterMs, getAdsbLolStaleAfterMs, getReceiverComparisonRadiusNm } from "@/lib/server/config";

export const AZIMUTH_BUCKETS = 36;
export const RANGE_BANDS = [25, 50, 75, 100, 125, 150, 175];
export const ALTITUDE_BANDS = [0, 5_000, 10_000, 20_000, 30_000, 40_000];
export const INSUFFICIENT_OBSERVATIONS = 20;

export type CoverageDimension = "overall" | "azimuth" | "range" | "altitude" | "polar";
export type CoveragePeriod = "live" | "today" | "7d" | "30d";
export interface CoverageBucket { key: string; label: string; available: number; captured: number; }
export interface CoverageResponse {
  period: CoveragePeriod; from: string; to: string; comparisonRadiusNm: number;
  summary: { available: number; captured: number; ratio: number | null; samples: number };
  azimuth: CoverageBucket[]; range: CoverageBucket[]; altitude: CoverageBucket[]; polar: CoverageBucket[];
  metadata: { referenceProviders: string[]; mixedProviders: boolean; insufficientThreshold: number; diagnostics: CoverageDiagnostics };
}
export interface CoverageDiagnostics {
  enabled: boolean; sampleIntervalMs: number; comparisonRadiusNm: number; lastSampleAt: string | null;
  samplesProcessed: number; availableObservations: number; capturedObservations: number; pendingBuckets: number;
  lastFlushAt: string | null; lastFlushDurationMs: number | null; lastFlushRows: number; flushFailures: number;
  lastError: string | null; skippedNoNetwork: number; skippedLocalUnhealthy: number;
}
type Counter = { available: number; captured: number };
type Aggregate = Map<string, Counter>;

function bucket(map: Aggregate, key: string): Counter { let value = map.get(key); if (!value) { value = { available: 0, captured: 0 }; map.set(key, value); } return value; }
function ratio(value: Counter): number | null { return value.available > 0 ? value.captured / value.available * 100 : null; }
function normalizeHour(date: Date): Date { return new Date(Math.floor(date.getTime() / 3_600_000) * 3_600_000); }
function instant(date: Date): Temporal.Instant { return Temporal.Instant.fromEpochMilliseconds(date.getTime()); }
function rangeBucket(distanceNm: number): number | null { const index = RANGE_BANDS.findIndex((edge) => distanceNm < edge); return index < 0 && distanceNm <= RANGE_BANDS.at(-1)! ? RANGE_BANDS.length - 1 : index < 0 ? null : index; }
function altitudeBucket(altitude: number | null): number | null { if (altitude === null || altitude < 0) return null; if (altitude < 5_000) return 0; if (altitude < 10_000) return 1; if (altitude < 20_000) return 2; if (altitude < 30_000) return 3; if (altitude < 40_000) return 4; return 5; }
function add(map: Aggregate, key: string, item: CoverageEligibility): void { const value = bucket(map, key); value.available += 1; if (item.captured) value.captured += 1; }

export function aggregateCoverage(network: readonly Aircraft[], local: ReadonlyMap<string, Aircraft>, receiver: ReceiverPosition, radiusNm: number, now = Date.now(), networkFreshMs = getAdsbLolStaleAfterMs(), localFreshMs = getAircraftStaleAfterMs()): { buckets: Aggregate; available: number; captured: number } {
  const buckets: Aggregate = new Map(); let available = 0; let captured = 0;
  for (const item of network) {
    const eligible = eligibleNetworkObservation(item, local.get(item.icaoHex.toUpperCase()), receiver, radiusNm, now, networkFreshMs, localFreshMs);
    if (!eligible) continue;
    available += 1; captured += eligible.captured ? 1 : 0;
    const azimuth = Math.min(AZIMUTH_BUCKETS - 1, Math.floor(eligible.bearing / 10));
    const range = rangeBucket(eligible.distanceKm / 1.852);
    add(buckets, "overall", eligible); add(buckets, `azimuth:${azimuth}`, eligible);
    if (range !== null) add(buckets, `range:${range}`, eligible);
    const altitude = altitudeBucket(eligible.altitude); if (altitude !== null) add(buckets, `altitude:${altitude}`, eligible);
    if (range !== null) add(buckets, `polar:${azimuth}:${range}`, eligible);
  }
  return { buckets, available, captured };
}

function toPublic(key: string, counter: Counter): CoverageBucket {
  const [, ...parts] = key.split(":");
  if (key === "overall") return { key, label: "Overall", ...counter };
  if (key.startsWith("azimuth:")) { const n = Number(parts[0]); return { key, label: `${n * 10}–${n * 10 + 10}°`, ...counter }; }
  if (key.startsWith("range:")) { const n = Number(parts[0]); return { key, label: `${n ? RANGE_BANDS[n - 1] : 0}–${RANGE_BANDS[n]} NM`, ...counter }; }
  if (key.startsWith("altitude:")) { const n = Number(parts[0]); return { key, label: ["< 5,000 ft", "5,000–10,000 ft", "10,000–20,000 ft", "20,000–30,000 ft", "30,000–40,000 ft", "≥ 40,000 ft"][n]!, ...counter }; }
  const az = Number(parts[0]); const range = Number(parts[1]); return { key, label: `${az * 10}–${az * 10 + 10}° · ${range ? RANGE_BANDS[range - 1] : 0}–${RANGE_BANDS[range]} NM`, ...counter };
}

export class ReceiverCoverageAnalytics {
  private readonly enabled: boolean;
  private readonly sampleIntervalMs: number;
  private readonly flushIntervalMs: number;
  private readonly radiusNm: number;
  private readonly pending: Aggregate = new Map();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private lastHour: Date | null = null;
  private providers = new Set<string>();
  private state: CoverageDiagnostics;
  constructor(options: { enabled?: boolean; sampleIntervalMs?: number; flushIntervalMs?: number; radiusNm?: number } = {}) {
    this.enabled = options.enabled ?? process.env.RECEIVER_COVERAGE_ANALYTICS_ENABLED?.trim().toLowerCase() !== "false";
    this.sampleIntervalMs = Math.min(30_000, Math.max(10_000, options.sampleIntervalMs ?? Number(process.env.RECEIVER_COVERAGE_SAMPLE_INTERVAL_MS ?? 20_000)));
    this.flushIntervalMs = Math.min(300_000, Math.max(60_000, options.flushIntervalMs ?? Number(process.env.RECEIVER_COVERAGE_FLUSH_INTERVAL_MS ?? 120_000)));
    this.radiusNm = options.radiusNm ?? getReceiverComparisonRadiusNm();
    this.state = { enabled: this.enabled, sampleIntervalMs: this.sampleIntervalMs, comparisonRadiusNm: this.radiusNm, lastSampleAt: null, samplesProcessed: 0, availableObservations: 0, capturedObservations: 0, pendingBuckets: 0, lastFlushAt: null, lastFlushDurationMs: null, lastFlushRows: 0, flushFailures: 0, lastError: null, skippedNoNetwork: 0, skippedLocalUnhealthy: 0 };
  }
  start(getSnapshot: () => { network: Aircraft[]; local: ReadonlyMap<string, Aircraft>; receiver: ReceiverPosition; localHealthy: boolean; providerDiagnostics: NetworkProviderDiagnostics }): void {
    if (!this.enabled || this.running) return; this.running = true;
    const tick = () => { if (!this.running) return; this.sample(getSnapshot); this.timer = setTimeout(tick, this.sampleIntervalMs); };
    this.flushTimer = setInterval(() => { void this.flush(); }, this.flushIntervalMs); tick();
  }
  stop(): Promise<void> { this.running = false; if (this.timer) clearTimeout(this.timer); if (this.flushTimer) clearInterval(this.flushTimer); this.timer = null; this.flushTimer = null; return this.flush(); }
  private sample(getSnapshot: () => { network: Aircraft[]; local: ReadonlyMap<string, Aircraft>; receiver: ReceiverPosition; localHealthy: boolean; providerDiagnostics: NetworkProviderDiagnostics }): void {
    const snapshot = getSnapshot();
    if (!snapshot.network.length || snapshot.providerDiagnostics.status === "disabled" || snapshot.providerDiagnostics.status === "disconnected" || snapshot.providerDiagnostics.status === "stale" || snapshot.providerDiagnostics.status === "timeout" || snapshot.providerDiagnostics.status === "http_error" || snapshot.providerDiagnostics.status === "invalid_response") { this.state.skippedNoNetwork += 1; return; }
    if (!snapshot.localHealthy) { this.state.skippedLocalUnhealthy += 1; return; }
    const now = Date.now(); const result = aggregateCoverage(snapshot.network, snapshot.local, snapshot.receiver, this.radiusNm, now);
    if (!result.available) return;
    const hour = normalizeHour(new Date(now)); if (!this.lastHour || this.lastHour.getTime() !== hour.getTime()) this.lastHour = hour;
    for (const [key, value] of result.buckets) { const target = bucket(this.pending, key); target.available += value.available; target.captured += value.captured; }
    this.providers.add(snapshot.providerDiagnostics.selectedSource ?? "unknown"); this.state.lastSampleAt = new Date(now).toISOString(); this.state.samplesProcessed += 1; this.state.availableObservations += result.available; this.state.capturedObservations += result.captured; this.state.pendingBuckets = this.pending.size;
  }
  async flush(): Promise<void> {
    if (!this.pending.size || !getPrisma() || !this.lastHour) return; const started = Date.now(); const rows = [...this.pending.entries()].map(([key, value]) => ({ hour: instant(this.lastHour!), dimension: key.split(":")[0], bucketKey: key, availableCount: value.available, capturedCount: value.captured, referenceProviders: [...this.providers].sort().join(",") }));
    try { const database = getPrisma(); if (!database) return; await database.transaction(async (transaction) => { const schema = transaction.orm.public; for (const row of rows) { const existing = await schema.ReceiverCoverageHourly.where({ hour: row.hour, bucketKey: row.bucketKey }).first(); if (existing) await schema.ReceiverCoverageHourly.where({ hour: row.hour, bucketKey: row.bucketKey }).update({ availableCount: existing.availableCount + row.availableCount, capturedCount: existing.capturedCount + row.capturedCount, referenceProviders: [existing.referenceProviders, row.referenceProviders].filter(Boolean).join(",") }); else await schema.ReceiverCoverageHourly.create(row); } }); this.pending.clear(); this.state.pendingBuckets = 0; this.state.lastFlushAt = new Date().toISOString(); this.state.lastFlushDurationMs = Date.now() - started; this.state.lastFlushRows = rows.length; this.state.lastError = null; } catch (error) { this.state.flushFailures += 1; this.state.lastError = error instanceof Error ? error.message : "coverage flush failed"; }
  }
  getDiagnostics(): CoverageDiagnostics { return { ...this.state }; }
  getLive(): CoverageResponse { const buckets = this.pending; const overall = buckets.get("overall") ?? { available: 0, captured: 0 }; const make = (prefix: string) => [...buckets.entries()].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => toPublic(key, value)); return { period: "live", from: this.state.lastSampleAt ?? new Date().toISOString(), to: new Date().toISOString(), comparisonRadiusNm: this.radiusNm, summary: { ...overall, ratio: ratio(overall), samples: this.state.samplesProcessed }, azimuth: make("azimuth:"), range: make("range:"), altitude: make("altitude:"), polar: make("polar:"), metadata: { referenceProviders: [...this.providers], mixedProviders: this.providers.size > 1, insufficientThreshold: INSUFFICIENT_OBSERVATIONS, diagnostics: this.getDiagnostics() } }; }
}

export function createReceiverCoverageAnalytics(): ReceiverCoverageAnalytics { return new ReceiverCoverageAnalytics(); }

export async function getHistoricalReceiverCoverage(period: Exclude<CoveragePeriod, "live">): Promise<CoverageResponse> {
  const now = new Date(); const days = period === "today" ? 1 : period === "7d" ? 7 : 30; const from = new Date(now.getTime() - days * 86_400_000);
  const database = getPrisma(); const aggregate: Aggregate = new Map(); const providers = new Set<string>();
  if (database) {
    const rows = await database.orm.public.ReceiverCoverageHourly.all();
    for (const row of rows) {
      const hour = row.hour instanceof Date ? row.hour : new Date(row.hour.epochMilliseconds);
      if (hour < from || hour > now) continue;
      const value = bucket(aggregate, row.bucketKey); value.available += row.availableCount; value.captured += row.capturedCount;
      for (const provider of row.referenceProviders.split(",").map((item: string) => item.trim()).filter(Boolean)) providers.add(provider);
    }
  }
  const overall = aggregate.get("overall") ?? { available: 0, captured: 0 };
  const make = (prefix: string) => [...aggregate.entries()].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => toPublic(key, value));
  return { period, from: from.toISOString(), to: now.toISOString(), comparisonRadiusNm: getReceiverComparisonRadiusNm(), summary: { ...overall, ratio: ratio(overall), samples: 0 }, azimuth: make("azimuth:"), range: make("range:"), altitude: make("altitude:"), polar: make("polar:"), metadata: { referenceProviders: [...providers].sort(), mixedProviders: providers.size > 1, insufficientThreshold: INSUFFICIENT_OBSERVATIONS, diagnostics: { enabled: true, sampleIntervalMs: 0, comparisonRadiusNm: getReceiverComparisonRadiusNm(), lastSampleAt: null, samplesProcessed: 0, availableObservations: overall.available, capturedObservations: overall.captured, pendingBuckets: 0, lastFlushAt: null, lastFlushDurationMs: null, lastFlushRows: 0, flushFailures: 0, lastError: null, skippedNoNetwork: 0, skippedLocalUnhealthy: 0 } } };
}
