import { adjacentCellKeys, cellKey, connectedCellGroups } from "@/lib/navigation-integrity/grid";
import { buildBaseline, median, type NavigationIntegrityBaseline } from "@/lib/navigation-integrity/baseline";
import { classifyNavigationIntegrity } from "@/lib/navigation-integrity/classification";
import type { NavigationIntegrityAnomaly, NavigationIntegrityCellSummary, NavigationIntegrityConfidence, NavigationIntegrityObservation } from "@/lib/navigation-integrity/types";

export const NAVIGATION_INTEGRITY_DETECTOR = Object.freeze({ minAircraft: 3, highConfidenceAircraft: 8, openEvaluations: 2, closeEvaluations: 3 });

function confidence(aircraftCount: number, localCount: number, durationSeconds: number, baselineReady: boolean): NavigationIntegrityConfidence {
  if (aircraftCount >= NAVIGATION_INTEGRITY_DETECTOR.highConfidenceAircraft && localCount >= 3 && durationSeconds >= 300 && baselineReady) return "HIGH";
  if (aircraftCount >= 5 || (aircraftCount >= 3 && localCount >= 3 && durationSeconds >= 120)) return "MEDIUM";
  return "LOW";
}

export function summariseCells(observations: NavigationIntegrityObservation[], baselines = buildBaseline(observations)): NavigationIntegrityCellSummary[] {
  const groups = new Map<string, NavigationIntegrityObservation[]>();
  for (const observation of observations) {
    const key = cellKey(observation.lat, observation.lon, observation.altitudeBand);
    const items = groups.get(key) ?? [];
    items.push(observation);
    groups.set(key, items);
  }
  return [...groups.entries()].map(([key, items]) => {
    const classified = items.map(classifyNavigationIntegrity);
    const affected = items.filter((item) => classifyNavigationIntegrity(item).state !== "NORMAL");
    const local = new Set(items.filter((item) => item.source === "LOCAL").map((item) => item.aircraftHex));
    const network = new Set(items.filter((item) => item.source === "NETWORK").map((item) => item.aircraftHex));
    const baseline = baselines.get(key);
    const state: NavigationIntegrityCellSummary["state"] = classified.some((item) => item.state === "SEVERE") ? "SEVERE" : classified.some((item) => item.state === "DEGRADED") ? "DEGRADED" : affected.length ? "REDUCED" : "NORMAL";
    return {
      cellKey: key, latCell: Number(key.split(":")[0]), lonCell: Number(key.split(":")[1]), altitudeBand: items[0]!.altitudeBand,
      sampleCount: items.length, aircraftCount: new Set(items.map((item) => item.aircraftHex)).size,
      localAircraftCount: local.size, networkAircraftCount: network.size, affectedAircraftCount: new Set(affected.map((item) => item.aircraftHex)).size,
      state, confidence: confidence(new Set(affected.map((item) => item.aircraftHex)).size, local.size, 0, Boolean(baseline && baseline.aircraftCount >= 3)),
      medianNic: median(items.map((item) => item.nic)), medianNacP: median(items.map((item) => item.nacP)), medianNacV: median(items.map((item) => item.nacV)),
      lastObservedAt: items.map((item) => item.observedAt).sort().at(-1)!,
    };
  }).sort((a, b) => a.cellKey.localeCompare(b.cellKey));
}

function qualifying(observation: NavigationIntegrityObservation): boolean {
  const state = classifyNavigationIntegrity(observation).state;
  return state === "REDUCED" || state === "DEGRADED" || state === "SEVERE";
}

export function detectNavigationIntegrityAnomalies(
  observations: NavigationIntegrityObservation[],
  now = new Date(),
  baselines: Map<string, NavigationIntegrityBaseline> = buildBaseline(observations),
): NavigationIntegrityAnomaly[] {
  const affectedByCell = new Map<string, NavigationIntegrityObservation[]>();
  for (const observation of observations) {
    if (!qualifying(observation)) continue;
    const key = cellKey(observation.lat, observation.lon, observation.altitudeBand);
    const items = affectedByCell.get(key) ?? [];
    items.push(observation);
    affectedByCell.set(key, items);
  }
  const candidateKeys = [...affectedByCell.entries()]
    .filter(([, items]) => new Set(items.map((item) => item.aircraftHex)).size >= 1)
    .map(([key]) => key);
  return connectedCellGroups(candidateKeys).flatMap((group, groupIndex) => {
    const items = group.flatMap((key) => affectedByCell.get(key) ?? []);
    const independent = [...new Set(items.map((item) => item.aircraftHex))].sort();
    if (independent.length < NAVIGATION_INTEGRITY_DETECTOR.minAircraft) return [];
    const local = independent.filter((hex) => items.some((item) => item.aircraftHex === hex && item.source === "LOCAL")).length;
    const first = items.map((item) => Date.parse(item.observedAt)).sort((a, b) => a - b)[0] ?? now.getTime();
    const last = items.map((item) => Date.parse(item.observedAt)).sort((a, b) => b - a)[0] ?? now.getTime();
    const baseline = group.map((key) => baselines.get(key)).find(Boolean);
    const severity = items.some((item) => classifyNavigationIntegrity(item).state === "SEVERE") ? "SEVERE" : items.some((item) => classifyNavigationIntegrity(item).state === "DEGRADED") ? "DEGRADED" : "REDUCED";
    const durationSeconds = Math.max(0, (last - first) / 1000);
    return [{
      id: `candidate-${groupIndex}-${group.join("|")}`,
      startedAt: new Date(first).toISOString(), lastObservedAt: new Date(last).toISOString(), endedAt: null,
      cellKeys: group, altitudeBands: [...new Set(items.map((item) => item.altitudeBand))].sort(), affectedAircraftCount: independent.length, sampleCount: items.length,
      baselineAircraftCount: baseline?.aircraftCount ?? 0, medianNic: median(items.map((item) => item.nic)), medianNacP: median(items.map((item) => item.nacP)), medianNacV: median(items.map((item) => item.nacV)),
      baselineMedianNic: baseline?.medianNic ?? null, baselineMedianNacP: baseline?.medianNacP ?? null, baselineMedianNacV: baseline?.medianNacV ?? null,
      confidence: confidence(independent.length, local, durationSeconds, Boolean(baseline && baseline.aircraftCount >= 3)), severity,
      evidence: { independentAircraft: independent, localAircraft: local, networkAircraft: independent.length - local, spatiallyAdjacent: group.length > 1, durationSeconds, affectedShare: null, reasons: ["minimum independent aircraft threshold met", ...(group.length > 1 ? ["adjacent cells are spatially coherent"] : [])] },
    }];
  });
}

export function hasAdjacentCellSupport(cellKeyValue: string, keys: string[]): boolean {
  const set = new Set(keys);
  return adjacentCellKeys(cellKeyValue).some((key) => set.has(key));
}
