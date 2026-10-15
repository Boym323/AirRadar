import type { Aircraft } from "@/lib/aircraft/types";
import { isFreshPosition } from "@/lib/aircraft/source-merge";

/** Aggregated, identity-free diagnostics. Only exposed through authenticated integrations API. */
export type NetworkSourceLane = "adsbhub" | "adsblolRaw" | "adsblolHttp";

export interface NetworkSourceValueLane {
  /** Snapshot length, not an upstream message rate. */
  reportedAircraft: number;
  /** Distinct aircraft with a position no older than the configured network TTL. */
  freshPositioned: number;
  /** Positions present only in this source among the successfully sampled sources. */
  exclusiveFreshPositioned: number;
  overlappingFreshPositioned: number;
}

export interface NetworkSourceValueDiagnostics {
  sampledAt: string;
  ageLimitMs: number;
  unionFreshPositioned: number;
  /** False when any configured source failed to return a snapshot. */
  complete: boolean;
  /** Absent means disabled; null means a configured source failed this sample. */
  sources: Partial<Record<NetworkSourceLane, NetworkSourceValueLane | null>>;
}

const LANES: readonly NetworkSourceLane[] = ["adsbhub", "adsblolRaw", "adsblolHttp"];

/**
 * Work is O(sum of snapshot sizes), once per minute, not per decoded SBS/BEAST
 * frame. ICAO keys exist only in a short-lived local map and are never emitted,
 * logged or persisted. No provider request is made by this function.
 */
export function summarizeNetworkSourceValue(
  samples: Partial<Record<NetworkSourceLane, ReadonlyArray<Aircraft> | null>>,
  now: number,
  ageLimitMs: number,
): NetworkSourceValueDiagnostics {
  const membership = new Map<string, number>();
  const sources: NetworkSourceValueDiagnostics["sources"] = {};
  let complete = true;
  for (const [index, lane] of LANES.entries()) {
    if (!Object.prototype.hasOwnProperty.call(samples, lane)) continue;
    const aircraft = samples[lane];
    if (!aircraft) {
      sources[lane] = null;
      complete = false;
      continue;
    }
    sources[lane] = {
      reportedAircraft: aircraft.length,
      freshPositioned: 0,
      exclusiveFreshPositioned: 0,
      overlappingFreshPositioned: 0,
    };
    const flag = 1 << index;
    for (const item of aircraft) {
      if (!isFreshPosition(item, ageLimitMs, now)) continue;
      membership.set(item.icaoHex, (membership.get(item.icaoHex) ?? 0) | flag);
    }
  }

  for (const mask of membership.values()) {
    const exclusive = (mask & (mask - 1)) === 0;
    for (const [index, lane] of LANES.entries()) {
      if ((mask & (1 << index)) === 0) continue;
      const value = sources[lane];
      if (!value) continue;
      value.freshPositioned += 1;
      if (exclusive) value.exclusiveFreshPositioned += 1;
      else value.overlappingFreshPositioned += 1;
    }
  }
  return {
    sampledAt: new Date(now).toISOString(),
    ageLimitMs,
    unionFreshPositioned: membership.size,
    complete,
    sources,
  };
}
