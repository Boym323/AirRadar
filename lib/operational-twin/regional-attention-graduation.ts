import type { RegionalAttentionOutcomeReport } from "./regional-attention-outcome";

export const REGIONAL_ATTENTION_GRADUATION_VERSION = "regional-attention-graduation-v1" as const;

export const REGIONAL_ATTENTION_GRADUATION_THRESHOLDS = {
  version: REGIONAL_ATTENTION_GRADUATION_VERSION,
  minimumSpanMinutes: 240,
  minimumScoreableSamples: 80,
  minimumScoreablePerHorizon: 15,
  minimumTruthCoverage: 0.70,
  minimumPrecision: 0.75,
  maximumMeanAbsoluteTimingErrorSeconds: 240,
} as const;

export type RegionalAttentionGraduationDecision = "PASS" | "WAIT" | "FAIL";
export type RegionalAttentionGraduationReason =
  | "span_insufficient"
  | "scoreable_samples_insufficient"
  | "horizon_samples_insufficient"
  | "truth_coverage_insufficient"
  | "outcome_validation_not_pass"
  | "precision_below_graduation"
  | "timing_error_above_graduation";

export interface RegionalAttentionGraduationReport {
  version: typeof REGIONAL_ATTENTION_GRADUATION_VERSION;
  generatedAt: string;
  decision: RegionalAttentionGraduationDecision;
  reasons: RegionalAttentionGraduationReason[];
  complete: boolean;
  thresholds: typeof REGIONAL_ATTENTION_GRADUATION_THRESHOLDS;
  outcomeVersion: string;
  outcomeDecision: RegionalAttentionOutcomeReport["decision"];
  scope: "REGIONAL_COPRESENCE_CONTEXT_ONLY";
  truthSource: RegionalAttentionOutcomeReport["truthSource"];
  autoPromotion: false;
  manualPromotionEligible: boolean;
  publicSemanticsRemainCanonical: true;
  destinationClusterEligible: false;
  collisionWarningEligible: false;
  separationProductEligible: false;
  evidence: {
    spanMinutes: number;
    scoreableSamples: number;
    horizonScoreableSamples: Record<string, number>;
    truthCoverage: number | null;
    precision: number | null;
    meanAbsoluteTimingErrorSeconds: number | null;
  };
}

export function buildRegionalAttentionGraduation(
  outcome: RegionalAttentionOutcomeReport,
): RegionalAttentionGraduationReport {
  const reasons: RegionalAttentionGraduationReason[] = [];
  const horizonScoreableSamples = Object.fromEntries(
    outcome.horizonsMinutes.map((horizon) => [
      String(horizon),
      outcome.horizons[String(horizon)]?.scoreable ?? 0,
    ]),
  );

  if (outcome.window.spanMinutes < REGIONAL_ATTENTION_GRADUATION_THRESHOLDS.minimumSpanMinutes) {
    reasons.push("span_insufficient");
  }
  if (outcome.overall.scoreable < REGIONAL_ATTENTION_GRADUATION_THRESHOLDS.minimumScoreableSamples) {
    reasons.push("scoreable_samples_insufficient");
  }
  if (outcome.horizonsMinutes.some((horizon) =>
    (outcome.horizons[String(horizon)]?.scoreable ?? 0)
      < REGIONAL_ATTENTION_GRADUATION_THRESHOLDS.minimumScoreablePerHorizon
  )) {
    reasons.push("horizon_samples_insufficient");
  }
  if (
    outcome.overall.truthCoverage === null
    || outcome.overall.truthCoverage < REGIONAL_ATTENTION_GRADUATION_THRESHOLDS.minimumTruthCoverage
  ) {
    reasons.push("truth_coverage_insufficient");
  }

  const evidenceComplete = reasons.length === 0;
  if (evidenceComplete) {
    if (outcome.decision !== "PASS") reasons.push("outcome_validation_not_pass");
    if (
      outcome.overall.precision === null
      || outcome.overall.precision < REGIONAL_ATTENTION_GRADUATION_THRESHOLDS.minimumPrecision
    ) {
      reasons.push("precision_below_graduation");
    }
    if (
      outcome.overall.meanAbsoluteTimingErrorSeconds === null
      || outcome.overall.meanAbsoluteTimingErrorSeconds
        > REGIONAL_ATTENTION_GRADUATION_THRESHOLDS.maximumMeanAbsoluteTimingErrorSeconds
    ) {
      reasons.push("timing_error_above_graduation");
    }
  }

  const decision: RegionalAttentionGraduationDecision = !evidenceComplete
    ? "WAIT"
    : reasons.length > 0
      ? "FAIL"
      : "PASS";

  return {
    version: REGIONAL_ATTENTION_GRADUATION_VERSION,
    generatedAt: outcome.generatedAt,
    decision,
    reasons,
    complete: evidenceComplete,
    thresholds: REGIONAL_ATTENTION_GRADUATION_THRESHOLDS,
    outcomeVersion: outcome.version,
    outcomeDecision: outcome.decision,
    scope: "REGIONAL_COPRESENCE_CONTEXT_ONLY",
    truthSource: outcome.truthSource,
    autoPromotion: false,
    manualPromotionEligible: decision === "PASS",
    publicSemanticsRemainCanonical: true,
    destinationClusterEligible: false,
    collisionWarningEligible: false,
    separationProductEligible: false,
    evidence: {
      spanMinutes: outcome.window.spanMinutes,
      scoreableSamples: outcome.overall.scoreable,
      horizonScoreableSamples,
      truthCoverage: outcome.overall.truthCoverage,
      precision: outcome.overall.precision,
      meanAbsoluteTimingErrorSeconds: outcome.overall.meanAbsoluteTimingErrorSeconds,
    },
  };
}
