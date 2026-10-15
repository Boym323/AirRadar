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
    const aircraft = new Set<string>();
    const affected = new Set<string>();
    const local = new Set<string>();
    const network = new Set<string>();
    let hasSevere = false;
    let hasDegraded = false;
    for (const item of items) {
      const classified = classifyNavigationIntegrity(item);
      aircraft.add(item.aircraftHex);
      if (item.source === "LOCAL") local.add(item.aircraftHex);
      if (item.source === "NETWORK") network.add(item.aircraftHex);
      if (classified.state !== "NORMAL") affected.add(item.aircraftHex);
      if (classified.state === "SEVERE") hasSevere = true;
      if (classified.state === "DEGRADED") hasDegraded = true;
    }
    const baseline = baselines.get(key);
    const state: NavigationIntegrityCellSummary["state"] = hasSevere ? "SEVERE" : hasDegraded ? "DEGRADED" : affected.size ? "REDUCED" : "NORMAL";
    return {
      cellKey: key, latCell: Number(key.split(":")[0]), lonCell: Number(key.split(":")[1]), altitudeBand: items[0]!.altitudeBand,
      sampleCount: items.length, aircraftCount: aircraft.size,
      localAircraftCount: local.size, networkAircraftCount: network.size, affectedAircraftCount: affected.size,
      state, confidence: confidence(affected.size, local.size, 0, Boolean(baseline && baseline.aircraftCount >= 3)),
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
  const normalByCell = new Map<string, Set<string>>();
  // Classify each observation once and index normal context once for all
  // candidates, rather than rescanning all N observations for each group.
  for (const observation of observations) {
    const key = cellKey(observation.lat, observation.lon, observation.altitudeBand);
    if (!qualifying(observation)) {
      let normal = normalByCell.get(key);
      if (!normal) {
        normal = new Set<string>();
        normalByCell.set(key, normal);
      }
      normal.add(observation.aircraftHex);
      continue;
    }
    const items = affectedByCell.get(key) ?? [];
    items.push(observation);
    affectedByCell.set(key, items);
  }
  return connectedCellGroups(affectedByCell.keys()).flatMap((group, groupIndex) => {
    const items = group.flatMap((key) => affectedByCell.get(key) ?? []);
    const independent = [...new Set(items.map((item) => item.aircraftHex))].sort();
    if (independent.length < NAVIGATION_INTEGRITY_DETECTOR.minAircraft) return [];
    const localAircraft = new Set<string>();
    const networkAircraft = new Set<string>();
    const occurrences = new Map<string, number>();
    let first = Number.POSITIVE_INFINITY;
    let last = Number.NEGATIVE_INFINITY;
    let hasInvalidTime = false;
    let hasSevere = false;
    let hasDegraded = false;
    let lowCount = 0;
    for (const item of items) {
      occurrences.set(item.aircraftHex, (occurrences.get(item.aircraftHex) ?? 0) + 1);
      if (item.source === "LOCAL") localAircraft.add(item.aircraftHex);
      if (item.source === "NETWORK") networkAircraft.add(item.aircraftHex);
      const observedAt = Date.parse(item.observedAt);
      if (!Number.isFinite(observedAt)) hasInvalidTime = true;
      else {
        if (observedAt < first) first = observedAt;
        if (observedAt > last) last = observedAt;
      }
      const state = classifyNavigationIntegrity(item).state;
      if (state === "SEVERE") hasSevere = true;
      if (state === "DEGRADED") hasDegraded = true;
      if ((item.nic !== null && item.nic <= 5) || (item.nacP !== null && item.nacP <= 6) || (item.nacV !== null && item.nacV <= 2)) lowCount += 1;
    }
    // Preserve the old sort-based behavior for malformed timestamps rather
    // than silently dropping them. Normal production observations are ISO.
    if (hasInvalidTime) {
      first = items.map((item) => Date.parse(item.observedAt)).sort((a, b) => a - b)[0] ?? now.getTime();
      last = items.map((item) => Date.parse(item.observedAt)).sort((a, b) => b - a)[0] ?? now.getTime();
    }
    const local = localAircraft.size;
    const baseline = group.map((key) => baselines.get(key)).find(Boolean);
    const severity = hasSevere ? "SEVERE" : hasDegraded ? "DEGRADED" : "REDUCED";
    const durationSeconds = Math.max(0, (last - first) / 1000);
    const currentLow = lowCount / items.length;
    const overlapAircraft = [...localAircraft].filter((hex) => networkAircraft.has(hex)).length;
    const baselineReady = Boolean(baseline && (baseline.maturity === "READY" || baseline.maturity === "STRONG"));
    const baselineLow = baseline?.lowIntegrityShare ?? null;
    const normalNearbyAircraft = new Set<string>();
    for (const key of group) for (const hex of normalByCell.get(key) ?? []) normalNearbyAircraft.add(hex);
    const currentNicMedian = median(items.map((item) => item.nic));
    const currentNacPMedian = median(items.map((item) => item.nacP));
    const currentNacVMedian = median(items.map((item) => item.nacV));
    const delta = (current: number | null, historical: number | null) => current === null || historical === null ? null : current - historical;
    const id = `candidate-${groupIndex}-${group.join("|")}`;
    const nacPDrop = delta(currentNacPMedian, baseline?.medianNacP ?? null);
    const rules = [
      { id: "MIN_AIRCRAFT", passed: independent.length >= NAVIGATION_INTEGRITY_DETECTOR.minAircraft, strength: independent.length >= 5 ? "STRONG" : "MODERATE", observed: independent.length, threshold: NAVIGATION_INTEGRITY_DETECTOR.minAircraft, explanation: `${independent.length} independent aircraft observed` },
      { id: "SPATIAL_COHERENCE", passed: group.length > 1, strength: group.length > 1 ? "MODERATE" : "NONE", observed: group.length, threshold: 2, explanation: group.length > 1 ? `${independent.length} affected aircraft span adjacent cells` : "single cell; no adjacent-cell support" },
      { id: "BASELINE_MATURITY", passed: baselineReady, strength: baseline?.maturity === "STRONG" ? "STRONG" : baseline?.maturity === "READY" ? "MODERATE" : "WEAK", observed: baseline?.maturity ?? "UNAVAILABLE", threshold: "READY", explanation: `baseline has ${baseline?.aircraftCount ?? 0} aircraft contributors across ${baseline?.timeBucketCount ?? 0} time buckets` },
      { id: "NACP_BASELINE_DROP", passed: nacPDrop !== null && nacPDrop < 0, strength: "NONE", observed: nacPDrop, threshold: "< 0", explanation: `current median ${currentNacPMedian ?? "unavailable"}, baseline median ${baseline?.medianNacP ?? "unavailable"}` },
      { id: "LOW_INTEGRITY_SHARE", passed: baselineLow !== null && currentLow > baselineLow, strength: baselineLow !== null && currentLow - baselineLow >= 0.2 ? "STRONG" : "WEAK", observed: currentLow, threshold: baselineLow, explanation: `low-integrity share ${Math.round(currentLow * 100)}% vs baseline ${baselineLow === null ? "unavailable" : Math.round(baselineLow * 100) + "%"}` },
      { id: "CONFIDENCE_MEDIUM", passed: independent.length >= 5 || (independent.length >= 3 && local >= 3 && durationSeconds >= 120), strength: independent.length >= 5 ? "MODERATE" : "WEAK", observed: independent.length, threshold: 5, explanation: independent.length >= 5 ? "current detector grants MEDIUM from five affected aircraft" : "current detector grants MEDIUM from three local aircraft sustained for 120 seconds" },
    ] as const;
    const auditCategories = [
      ...(baseline?.maturity === "IMMATURE" || baseline?.maturity === "PARTIAL" || !baseline ? ["BASELINE_IMMATURE" as const] : []),
      ...(independent.length && Math.max(...occurrences.values()) / items.length > 0.5 ? ["AIRCRAFT_SPECIFIC" as const] : []),
      ...(baseline && delta(currentNacPMedian, baseline.medianNacP) === 0 && delta(currentNicMedian, baseline.medianNic) === 0 && delta(currentLow, baseline.lowIntegrityShare) === 0 ? ["WEAK_EVIDENCE" as const] : []),
    ];
    const structured = {
      candidateId: id, generatedAt: now.toISOString(), cellIds: group, altitudeBands: [...new Set(items.map((item) => item.altitudeBand))].sort(), affectedAircraftCount: independent.length, independentAircraftCount: independent.length,
      nearbyNormalAircraftCount: normalNearbyAircraft.size,
      current: { nicMedian: currentNicMedian, nacpMedian: currentNacPMedian, nacvMedian: currentNacVMedian, lowIntegrityShare: currentLow },
      baseline: { nicMedian: baseline?.medianNic ?? null, nacpMedian: baseline?.medianNacP ?? null, nacvMedian: baseline?.medianNacV ?? null, lowIntegrityShare: baselineLow, sampleCount: baseline?.sampleCount ?? 0, aircraftCount: baseline?.aircraftCount ?? 0, maturity: baseline?.maturity ?? "UNAVAILABLE", firstObservedAt: baseline?.firstObservedAt ?? null, lastObservedAt: baseline?.lastObservedAt ?? null, timeBucketCount: baseline?.timeBucketCount ?? 0 },
      delta: { nic: delta(currentNicMedian, baseline?.medianNic ?? null), nacp: nacPDrop, nacv: delta(currentNacVMedian, baseline?.medianNacV ?? null), lowIntegrityShare: delta(currentLow, baselineLow) },
      spatial: { affectedCells: group.length, coherentCells: group.length, adjacencyScore: group.length > 1 ? 1 : 0 }, temporal: { durationSeconds, consecutiveQualifyingEvaluations: 1, hysteresisState: "CANDIDATE" as const }, source: { localAircraft: localAircraft.size, networkAircraft: networkAircraft.size, overlapAircraft }, rules: [...rules], auditCategories: auditCategories.length ? auditCategories : ["UNKNOWN" as const], likelyExplanation: baselineReady ? "Correlated navigation anomaly candidate with a ready baseline." : "Candidate opened on integrity classifications, but baseline evidence is limited; do not infer cause.",
    };
    return [{
      id: `candidate-${groupIndex}-${group.join("|")}`,
      startedAt: new Date(first).toISOString(), lastObservedAt: new Date(last).toISOString(), endedAt: null,
      cellKeys: group, altitudeBands: [...new Set(items.map((item) => item.altitudeBand))].sort(), affectedAircraftCount: independent.length, sampleCount: items.length,
      baselineAircraftCount: baseline?.aircraftCount ?? 0, medianNic: currentNicMedian, medianNacP: currentNacPMedian, medianNacV: currentNacVMedian,
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
