import type {
  NavigationIntegrityConfidence,
  NavigationIntegrityEvidence,
  NavigationIntegrityBaselineMaturity,
  NavigationIntegrityShadowResult,
} from "@/lib/navigation-integrity/types";

const MATURE_BASELINES = new Set<NavigationIntegrityBaselineMaturity>(["READY", "STRONG"]);
const NEGATIVE_DELTA = -1;

function meaningful(value: number | null): boolean {
  return value !== null && value <= NEGATIVE_DELTA;
}

function strongLowIntegrityDelta(value: number | null): boolean {
  return value !== null && value >= 0.15;
}

function fieldDegradation(evidence: NavigationIntegrityEvidence): number {
  return [evidence.delta.nic, evidence.delta.nacp, evidence.delta.nacv].filter(meaningful).length;
}

function spatiallyCoherent(evidence: NavigationIntegrityEvidence): boolean {
  return evidence.spatial.affectedCells > 1 && evidence.spatial.adjacencyScore >= 0.5;
}

function independentSources(evidence: NavigationIntegrityEvidence): boolean {
  return evidence.source.localAircraft > 0 && evidence.source.networkAircraft > 0 && evidence.source.overlapAircraft === 0;
}

/**
 * Conservative, confidence-only evaluator. It consumes the detector's structured
 * evidence and never participates in candidate qualification or persistence.
 */
export function evaluateNavigationIntegrityConfidenceShadow(
  evidence: NavigationIntegrityEvidence,
  currentConfidence: NavigationIntegrityConfidence,
): NavigationIntegrityShadowResult {
  const reasons: string[] = [];
  const baseline = evidence.baseline.maturity;
  const fields = fieldDegradation(evidence);
  const hasMedianDegradation = fields > 0;
  const hasStrongMultiFieldDegradation = fields >= 2;
  const hasMeaningfulShareDelta = strongLowIntegrityDelta(evidence.delta.lowIntegrityShare);
  const hasStrongEvidence = hasStrongMultiFieldDegradation || hasMeaningfulShareDelta;
  const spatial = spatiallyCoherent(evidence);
  const sustained = evidence.temporal.durationSeconds >= 300 && evidence.temporal.consecutiveQualifyingEvaluations >= 2;
  const mature = MATURE_BASELINES.has(baseline);
  const exceptional = evidence.independentAircraftCount >= 10 && spatial && hasStrongMultiFieldDegradation && sustained;

  if (baseline === "UNAVAILABLE" || baseline === "IMMATURE") reasons.push("BASELINE_IMMATURE");
  if (!hasMedianDegradation && !hasMeaningfulShareDelta) reasons.push("NO_MEDIAN_DEGRADATION");
  if (evidence.independentAircraftCount < 5) reasons.push("INSUFFICIENT_INDEPENDENT_AIRCRAFT");
  if (evidence.independentAircraftCount >= 5 && !hasStrongEvidence) reasons.push("AIRCRAFT_COUNT_ONLY");
  if (!spatial) reasons.push("NO_SPATIAL_COHERENCE");
  if (!sustained) reasons.push("TRANSIENT_OR_UNCONFIRMED_DURATION");
  if (evidence.delta.nic === 0 || evidence.delta.nacp === 0 || evidence.delta.nacv === 0) reasons.push("UNCHANGED_MEDIAN_NOT_DEGRADATION");
  if (evidence.source.overlapAircraft > 0 || !independentSources(evidence) && evidence.source.networkAircraft > 0) reasons.push("SOURCE_CORROBORATION_LIMITED");

  if (exceptional) reasons.push("EXTRAORDINARY_MULTI_FIELD_EXCEPTION");

  let shadowConfidence: NavigationIntegrityConfidence = "LOW";
  if ((mature || baseline === "PARTIAL" || exceptional) && evidence.independentAircraftCount >= 5 && spatial && hasStrongEvidence && sustained) {
    shadowConfidence = "MEDIUM";
  }
  if (baseline === "PARTIAL" && !hasStrongEvidence) shadowConfidence = "LOW";
  if (baseline === "UNAVAILABLE" || baseline === "IMMATURE") shadowConfidence = exceptional ? "MEDIUM" : "LOW";

  const high = baseline === "STRONG"
    && evidence.independentAircraftCount >= 10
    && spatial
    && hasStrongMultiFieldDegradation
    && sustained
    && (evidence.source.localAircraft >= 3 || independentSources(evidence));
  if (high) shadowConfidence = "HIGH";

  return { currentConfidence, shadowConfidence, reasonCodes: [...new Set(reasons)] };
}
