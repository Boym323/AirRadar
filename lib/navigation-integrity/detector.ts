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
    const currentLow = items.filter((item) => (item.nic !== null && item.nic <= 5) || (item.nacP !== null && item.nacP <= 6) || (item.nacV !== null && item.nacV <= 2)).length / items.length;
    const localAircraft = new Set(items.filter((item) => item.source === "LOCAL").map((item) => item.aircraftHex));
    const networkAircraft = new Set(items.filter((item) => item.source === "NETWORK").map((item) => item.aircraftHex));
    const overlapAircraft = [...localAircraft].filter((hex) => networkAircraft.has(hex)).length;
    const baselineReady = Boolean(baseline && (baseline.maturity === "READY" || baseline.maturity === "STRONG"));
    const baselineLow = baseline?.lowIntegrityShare ?? null;
    const normalNearbyAircraft = new Set(observations.filter((item) => group.includes(cellKey(item.lat, item.lon, item.altitudeBand)) && !qualifying(item)).map((item) => item.aircraftHex));
    const delta = (current: number | null, historical: number | null) => current === null || historical === null ? null : current - historical;
    const id = `candidate-${groupIndex}-${group.join("|")}`;
    const rules = [
      { id: "MIN_AIRCRAFT", passed: independent.length >= NAVIGATION_INTEGRITY_DETECTOR.minAircraft, strength: independent.length >= 5 ? "STRONG" : "MODERATE", observed: independent.length, threshold: NAVIGATION_INTEGRITY_DETECTOR.minAircraft, explanation: `${independent.length} independent aircraft observed` },
      { id: "SPATIAL_COHERENCE", passed: group.length > 1, strength: group.length > 1 ? "MODERATE" : "NONE", observed: group.length, threshold: 2, explanation: group.length > 1 ? `${independent.length} affected aircraft span adjacent cells` : "single cell; no adjacent-cell support" },
      { id: "BASELINE_MATURITY", passed: baselineReady, strength: baseline?.maturity === "STRONG" ? "STRONG" : baseline?.maturity === "READY" ? "MODERATE" : "WEAK", observed: baseline?.maturity ?? "UNAVAILABLE", threshold: "READY", explanation: `baseline has ${baseline?.aircraftCount ?? 0} aircraft contributors across ${baseline?.timeBucketCount ?? 0} time buckets` },
      { id: "NACP_BASELINE_DROP", passed: delta(median(items.map((item) => item.nacP)), baseline?.medianNacP ?? null) !== null && (delta(median(items.map((item) => item.nacP)), baseline?.medianNacP ?? null) ?? 0) < 0, strength: "NONE", observed: delta(median(items.map((item) => item.nacP)), baseline?.medianNacP ?? null), threshold: "< 0", explanation: `current median ${median(items.map((item) => item.nacP)) ?? "unavailable"}, baseline median ${baseline?.medianNacP ?? "unavailable"}` },
      { id: "LOW_INTEGRITY_SHARE", passed: baselineLow !== null && currentLow > baselineLow, strength: baselineLow !== null && currentLow - baselineLow >= 0.2 ? "STRONG" : "WEAK", observed: currentLow, threshold: baselineLow, explanation: `low-integrity share ${Math.round(currentLow * 100)}% vs baseline ${baselineLow === null ? "unavailable" : Math.round(baselineLow * 100) + "%"}` },
      { id: "CONFIDENCE_MEDIUM", passed: independent.length >= 5 || (independent.length >= 3 && local >= 3 && durationSeconds >= 120), strength: independent.length >= 5 ? "MODERATE" : "WEAK", observed: independent.length, threshold: 5, explanation: independent.length >= 5 ? "current detector grants MEDIUM from five affected aircraft" : "current detector grants MEDIUM from three local aircraft sustained for 120 seconds" },
    ] as const;
    const auditCategories = [
      ...(baseline?.maturity === "IMMATURE" || baseline?.maturity === "PARTIAL" || !baseline ? ["BASELINE_IMMATURE" as const] : []),
      ...(independent.length && Math.max(...items.map((item) => items.filter((candidate) => candidate.aircraftHex === item.aircraftHex).length)) / items.length > 0.5 ? ["AIRCRAFT_SPECIFIC" as const] : []),
      ...(baseline && delta(median(items.map((item) => item.nacP)), baseline.medianNacP) === 0 && delta(median(items.map((item) => item.nic)), baseline.medianNic) === 0 && delta(currentLow, baseline.lowIntegrityShare) === 0 ? ["WEAK_EVIDENCE" as const] : []),
    ];
    const structured = {
      candidateId: id, generatedAt: now.toISOString(), cellIds: group, altitudeBands: [...new Set(items.map((item) => item.altitudeBand))].sort(), affectedAircraftCount: independent.length, independentAircraftCount: independent.length,
      nearbyNormalAircraftCount: normalNearbyAircraft.size,
      current: { nicMedian: median(items.map((item) => item.nic)), nacpMedian: median(items.map((item) => item.nacP)), nacvMedian: median(items.map((item) => item.nacV)), lowIntegrityShare: currentLow },
      baseline: { nicMedian: baseline?.medianNic ?? null, nacpMedian: baseline?.medianNacP ?? null, nacvMedian: baseline?.medianNacV ?? null, lowIntegrityShare: baselineLow, sampleCount: baseline?.sampleCount ?? 0, aircraftCount: baseline?.aircraftCount ?? 0, maturity: baseline?.maturity ?? "UNAVAILABLE", firstObservedAt: baseline?.firstObservedAt ?? null, lastObservedAt: baseline?.lastObservedAt ?? null, timeBucketCount: baseline?.timeBucketCount ?? 0 },
      delta: { nic: delta(median(items.map((item) => item.nic)), baseline?.medianNic ?? null), nacp: delta(median(items.map((item) => item.nacP)), baseline?.medianNacP ?? null), nacv: delta(median(items.map((item) => item.nacV)), baseline?.medianNacV ?? null), lowIntegrityShare: delta(currentLow, baselineLow) },
      spatial: { affectedCells: group.length, coherentCells: group.length, adjacencyScore: group.length > 1 ? 1 : 0 }, temporal: { durationSeconds, consecutiveQualifyingEvaluations: 1, hysteresisState: "CANDIDATE" as const }, source: { localAircraft: localAircraft.size, networkAircraft: networkAircraft.size, overlapAircraft }, rules: [...rules], auditCategories: auditCategories.length ? auditCategories : ["UNKNOWN" as const], likelyExplanation: baselineReady ? "Correlated navigation anomaly candidate with a ready baseline." : "Candidate opened on integrity classifications, but baseline evidence is limited; do not infer cause.",
    };
    return [{
      id: `candidate-${groupIndex}-${group.join("|")}`,
      startedAt: new Date(first).toISOString(), lastObservedAt: new Date(last).toISOString(), endedAt: null,
      cellKeys: group, altitudeBands: [...new Set(items.map((item) => item.altitudeBand))].sort(), affectedAircraftCount: independent.length, sampleCount: items.length,
      baselineAircraftCount: baseline?.aircraftCount ?? 0, medianNic: median(items.map((item) => item.nic)), medianNacP: median(items.map((item) => item.nacP)), medianNacV: median(items.map((item) => item.nacV)),
      baselineMedianNic: baseline?.medianNic ?? null, baselineMedianNacP: baseline?.medianNacP ?? null, baselineMedianNacV: baseline?.medianNacV ?? null,
      confidence: confidence(independent.length, local, durationSeconds, Boolean(baseline && baseline.aircraftCount >= 3)), severity,
      evidence: { independentAircraft: independent, localAircraft: local, networkAircraft: independent.length - local, spatiallyAdjacent: group.length > 1, durationSeconds, affectedShare: null, reasons: ["minimum independent aircraft threshold met", ...(group.length > 1 ? ["adjacent cells are spatially coherent"] : [])], structured },
    }];
  });
}

export function hasAdjacentCellSupport(cellKeyValue: string, keys: string[]): boolean {
  const set = new Set(keys);
  return adjacentCellKeys(cellKeyValue).some((key) => set.has(key));
}
