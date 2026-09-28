import { cellKey } from "@/lib/navigation-integrity/grid";
import type { NavigationIntegrityBaselineMaturity, NavigationIntegrityObservation } from "@/lib/navigation-integrity/types";

export interface NavigationIntegrityBaseline {
  sampleCount: number;
  aircraftCount: number;
  medianNic: number | null;
  medianNacP: number | null;
  medianNacV: number | null;
  lowIntegrityShare: number | null;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  timeBucketCount: number;
  maturity: NavigationIntegrityBaselineMaturity;
}

export const BASELINE_THRESHOLDS = Object.freeze({ partialAircraft: 3, readyAircraft: 5, strongAircraft: 8, readySamples: 20, readyBuckets: 3, strongBuckets: 6, bucketMs: 15 * 60_000 });

function maturity(items: NavigationIntegrityObservation[], aircraftCount: number): NavigationIntegrityBaselineMaturity {
  if (!items.length || aircraftCount === 0) return "UNAVAILABLE";
  const buckets = new Set(items.map((item) => Math.floor(Date.parse(item.observedAt) / BASELINE_THRESHOLDS.bucketMs))).size;
  if (aircraftCount >= BASELINE_THRESHOLDS.strongAircraft && items.length >= BASELINE_THRESHOLDS.readySamples && buckets >= BASELINE_THRESHOLDS.strongBuckets) return "STRONG";
  if (aircraftCount >= BASELINE_THRESHOLDS.readyAircraft && items.length >= BASELINE_THRESHOLDS.readySamples && buckets >= BASELINE_THRESHOLDS.readyBuckets) return "READY";
  if (aircraftCount >= BASELINE_THRESHOLDS.partialAircraft && items.length >= 6) return "PARTIAL";
  return "IMMATURE";
}

const values = (items: Array<number | null>): number[] => items.filter((value): value is number => value !== null && Number.isFinite(value)).sort((a, b) => a - b);
export function median(items: Array<number | null>): number | null {
  const sorted = values(items);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function buildBaseline(observations: NavigationIntegrityObservation[]): Map<string, NavigationIntegrityBaseline> {
  const grouped = new Map<string, NavigationIntegrityObservation[]>();
  for (const observation of observations) {
    const key = cellKey(observation.lat, observation.lon, observation.altitudeBand);
    const bucket = grouped.get(key) ?? [];
    bucket.push(observation);
    grouped.set(key, bucket);
  }
  return new Map([...grouped.entries()].map(([key, items]) => {
    const aircraftCount = new Set(items.map((item) => item.aircraftHex)).size;
    const times = items.map((item) => Date.parse(item.observedAt)).filter(Number.isFinite).sort((a, b) => a - b);
    const low = items.filter((item) => (item.nic !== null && item.nic <= 5) || (item.nacP !== null && item.nacP <= 6) || (item.nacV !== null && item.nacV <= 2)).length;
    return [key, {
      sampleCount: items.length, aircraftCount,
      medianNic: median(items.map((item) => item.nic)), medianNacP: median(items.map((item) => item.nacP)), medianNacV: median(items.map((item) => item.nacV)),
      lowIntegrityShare: items.length ? low / items.length : null,
      firstObservedAt: times.length ? new Date(times[0]!).toISOString() : null,
      lastObservedAt: times.length ? new Date(times.at(-1)!).toISOString() : null,
      timeBucketCount: new Set(times.map((time) => Math.floor(time / BASELINE_THRESHOLDS.bucketMs))).size,
      maturity: maturity(items, aircraftCount),
    } satisfies NavigationIntegrityBaseline];
  }));
}
