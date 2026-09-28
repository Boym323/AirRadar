import { cellKey } from "@/lib/navigation-integrity/grid";
import type { NavigationIntegrityObservation } from "@/lib/navigation-integrity/types";

export interface NavigationIntegrityBaseline {
  sampleCount: number;
  aircraftCount: number;
  medianNic: number | null;
  medianNacP: number | null;
  medianNacV: number | null;
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
  return new Map([...grouped.entries()].map(([key, items]) => [key, {
    sampleCount: items.length,
    aircraftCount: new Set(items.map((item) => item.aircraftHex)).size,
    medianNic: median(items.map((item) => item.nic)),
    medianNacP: median(items.map((item) => item.nacP)),
    medianNacV: median(items.map((item) => item.nacV)),
  }]));
}
