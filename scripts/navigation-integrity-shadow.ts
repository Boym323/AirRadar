import { mkdir, writeFile } from "node:fs/promises";
import { evaluateNavigationIntegrityConfidenceShadow } from "@/lib/navigation-integrity/shadow";
import { getNavigationIntegrityService } from "@/lib/server/navigation-integrity";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/db";
import type { NavigationIntegrityAnomaly, NavigationIntegrityEvidence, NavigationIntegrityConfidence } from "@/lib/navigation-integrity/types";

const OUT = "artifacts/navigation-integrity-shadow.json";
const now = new Date();
const service = getNavigationIntegrityService();

function histogram(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((result, value) => { result[value] = (result[value] ?? 0) + 1; return result; }, {});
}

function evidenceOf(candidate: NavigationIntegrityAnomaly): NavigationIntegrityEvidence {
  if (candidate.evidence.structured) return candidate.evidence.structured;
  return {
    candidateId: candidate.id, generatedAt: now.toISOString(), cellIds: candidate.cellKeys, altitudeBands: candidate.altitudeBands,
    affectedAircraftCount: candidate.affectedAircraftCount, independentAircraftCount: candidate.evidence.independentAircraft.length,
    nearbyNormalAircraftCount: 0,
    current: { nicMedian: candidate.medianNic, nacpMedian: candidate.medianNacP, nacvMedian: candidate.medianNacV, lowIntegrityShare: null },
    baseline: { nicMedian: candidate.baselineMedianNic, nacpMedian: candidate.baselineMedianNacP, nacvMedian: candidate.baselineMedianNacV, lowIntegrityShare: null, sampleCount: candidate.sampleCount, aircraftCount: candidate.baselineAircraftCount, maturity: "UNAVAILABLE", firstObservedAt: null, lastObservedAt: null, timeBucketCount: 0 },
    delta: { nic: null, nacp: null, nacv: null, lowIntegrityShare: null },
    spatial: { affectedCells: candidate.cellKeys.length, coherentCells: candidate.evidence.spatiallyAdjacent ? candidate.cellKeys.length : 1, adjacencyScore: candidate.evidence.spatiallyAdjacent ? 1 : 0 },
    temporal: { durationSeconds: candidate.evidence.durationSeconds, consecutiveQualifyingEvaluations: 1, hysteresisState: candidate.endedAt ? "CANDIDATE" : "ACTIVE" },
    source: { localAircraft: candidate.evidence.localAircraft, networkAircraft: candidate.evidence.networkAircraft, overlapAircraft: 0 }, rules: [], auditCategories: [], likelyExplanation: "Persisted candidate predates structured shadow evidence.",
  };
}

type ShadowRow = {
  id: string; candidate: string; aircraft: number; baselineMaturity: string; nicDelta: number | null; nacpDelta: number | null; nacvDelta: number | null;
  lowIntegrityDelta: number | null; durationSeconds: number; currentConfidence: NavigationIntegrityConfidence; shadowConfidence: NavigationIntegrityConfidence; reason: string[];
};

const candidates = await service.getHistory(new Date(now.getTime() - 24 * 60 * 60_000), now);
const rows: ShadowRow[] = candidates.map((candidate) => {
  const evidence = evidenceOf(candidate);
  const result = evaluateNavigationIntegrityConfidenceShadow(evidence, candidate.confidence);
  return { id: candidate.id, candidate: candidate.cellKeys.join("|"), aircraft: evidence.independentAircraftCount, baselineMaturity: evidence.baseline.maturity, nicDelta: evidence.delta.nic, nacpDelta: evidence.delta.nacp, nacvDelta: evidence.delta.nacv, lowIntegrityDelta: evidence.delta.lowIntegrityShare, durationSeconds: evidence.temporal.durationSeconds, currentConfidence: result.currentConfidence, shadowConfidence: result.shadowConfidence, reason: result.reasonCodes };
});

const transitions = histogram(rows.map((row) => `${row.currentConfidence}→${row.shadowConfidence}`));
const changed = rows.filter((row) => row.currentConfidence !== row.shadowConfidence);
const reasonHistogram = histogram(rows.flatMap((row) => row.reason));
const aircraftCountOnly = rows.filter((row) => row.reason.includes("AIRCRAFT_COUNT_ONLY"));
const weakEvidence = rows.filter((row) => row.reason.includes("NO_MEDIAN_DEGRADATION"));
const immature = rows.filter((row) => row.reason.includes("BASELINE_IMMATURE"));
const confidence = (values: string[]) => ({ LOW: values.filter((value) => value === "LOW").length, MEDIUM: values.filter((value) => value === "MEDIUM").length, HIGH: values.filter((value) => value === "HIGH").length });

let observationCount: number | null = null;
let uniqueAircraft: number | null = null;
let spatialCells: number | null = null;
if (isDatabaseConfigured()) {
  const database = getPrisma();
  if (database) {
    try {
      const observations = await database.orm.public.NavigationIntegrityObservation.select("aircraftHex", "latCell", "lonCell", "altitudeBand").limit(50_000).all();
      observationCount = observations.length;
      uniqueAircraft = new Set(observations.map((row) => row.aircraftHex)).size;
      spatialCells = new Set(observations.map((row) => `${row.latCell}:${row.lonCell}:${row.altitudeBand}`)).size;
    } catch { /* audit remains useful without production database access */ }
  }
}

const productionSample = {
  observationCount, uniqueAircraft, spatialCells, candidateCount: rows.length,
  baselineReadiness: "See artifacts/navigation-integrity-quality.json; replay is read-only",
  trafficWeightedReadiness: "See artifacts/navigation-integrity-quality.json; replay is read-only",
};

const report = {
  generatedAt: now.toISOString(), window: "24h", productionSample,
  currentConfidence: confidence(rows.map((row) => row.currentConfidence)),
  shadowConfidence: confidence(rows.map((row) => row.shadowConfidence)),
  transitions, reasonHistogram,
  keyCases: { aircraftCountOnly: aircraftCountOnly.length, weakEvidence: weakEvidence.length, baselineImmature: immature.length, changedConfidence: changed.length },
  aircraftCountOnlyCases: aircraftCountOnly,
  changedCandidates: changed,
  representativeUnchanged: rows.filter((row) => row.currentConfidence === row.shadowConfidence).slice(0, 20),
  allCandidates: rows,
  decision: "WAIT FOR MORE DATA",
  notes: [
    "Shadow evaluation is read-only and does not alter candidate qualification, live confidence, UI, alerts, or persistence.",
    "No confirmed GNSS interference is inferred.",
    "A production decision requires this replay together with the deterministic synthetic control suite and full validation.",
  ],
};
await mkdir("artifacts", { recursive: true });
await writeFile(OUT, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(`Wrote ${OUT} (${rows.length} candidates; ${changed.length} confidence transitions)`);
