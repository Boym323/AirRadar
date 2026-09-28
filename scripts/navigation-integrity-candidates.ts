import { mkdir, writeFile } from "node:fs/promises";
import { getNavigationIntegrityService } from "@/lib/server/navigation-integrity";

const service = getNavigationIntegrityService();
const generatedAt = new Date();
const candidates = (await service.getHistory(new Date(generatedAt.getTime() - 24 * 60 * 60_000), generatedAt)).slice(0, 100).map((candidate) => ({
  id: candidate.id, start: candidate.startedAt, end: candidate.endedAt ?? candidate.lastObservedAt,
  duration: candidate.evidence.structured?.temporal.durationSeconds ?? candidate.evidence.durationSeconds,
  cells: candidate.cellKeys, altitudeBands: candidate.altitudeBands,
  affectedAircraft: candidate.affectedAircraftCount,
  nearbyNormalAircraft: candidate.evidence.structured?.nearbyNormalAircraftCount ?? null,
  current: candidate.evidence.structured?.current ?? { nicMedian: candidate.medianNic, nacpMedian: candidate.medianNacP, nacvMedian: candidate.medianNacV, lowIntegrityShare: null },
  baseline: candidate.evidence.structured?.baseline ?? { nicMedian: candidate.baselineMedianNic, nacpMedian: candidate.baselineMedianNacP, nacvMedian: candidate.baselineMedianNacV, lowIntegrityShare: null, sampleCount: candidate.sampleCount, aircraftCount: candidate.baselineAircraftCount, maturity: "UNKNOWN", firstObservedAt: null, lastObservedAt: null, timeBucketCount: 0 },
  deltas: candidate.evidence.structured?.delta ?? null, source: candidate.evidence.structured?.source ?? { localAircraft: candidate.evidence.localAircraft, networkAircraft: candidate.evidence.networkAircraft, overlapAircraft: null },
  rules: candidate.evidence.structured?.rules ?? [], confidence: candidate.confidence, severity: candidate.severity,
  auditCategories: candidate.evidence.structured?.auditCategories ?? ["UNKNOWN"],
  likelyExplanation: candidate.evidence.structured?.likelyExplanation ?? "Persisted candidate predates structured V1.1 evidence.",
}));
await mkdir("artifacts", { recursive: true });
await writeFile("artifacts/navigation-integrity-candidates.json", JSON.stringify({ generatedAt: generatedAt.toISOString(), window: "24h", candidates, interpretation: "Candidates are heuristic correlated navigation anomalies; no entry confirms GNSS interference or jamming." }, null, 2) + "\n", "utf8");
console.log(`Wrote artifacts/navigation-integrity-candidates.json (${candidates.length} candidates)`);
