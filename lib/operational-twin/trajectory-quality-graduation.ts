import type {
  OperationalTwinTrajectoryQualityOutcomeReport,
  OperationalTwinTrajectoryQualityOutcomeSlice,
} from "./trajectory-quality-outcome";
import type { OperationalTwinTrajectoryPhase } from "./trajectory-quality-v2";

export const OPERATIONAL_TWIN_TRAJECTORY_QUALITY_GRADUATION_VERSION =
  "operational-digital-twin-trajectory-quality-graduation-v1" as const;

export const OPERATIONAL_TWIN_TRAJECTORY_QUALITY_GRADUATION_THRESHOLDS = {
  version: OPERATIONAL_TWIN_TRAJECTORY_QUALITY_GRADUATION_VERSION,
  minimumSpanMinutes: 240,
  minimumPairedSamples: 120,
  minimumPairedSamplesPerHorizon: 24,
  minimumTruthCoverage: 0.75,
  minimumRelativeMaeImprovement: 0.08,
  minimumQualityWinRate: 0.60,
  maximumHorizonRegressionFraction: 0.05,
  minimumPhaseSamplesForGuard: 12,
  maximumPhaseRegressionFraction: 0.08,
} as const;

export type OperationalTwinTrajectoryQualityGraduationDecision = "PASS" | "WAIT" | "FAIL";

export type OperationalTwinTrajectoryQualityGraduationReason =
  | "span_insufficient"
  | "paired_samples_insufficient"
  | "horizon_samples_insufficient"
  | "truth_coverage_insufficient"
  | "outcome_validation_not_pass"
  | "relative_mae_improvement_below_graduation"
  | "quality_win_rate_below_graduation"
  | "horizon_regression"
  | "phase_regression";

export interface OperationalTwinTrajectoryQualityRegression {
  key: string;
  pairedSamples: number;
  canonicalMeanAbsoluteErrorFt: number;
  qualityMeanAbsoluteErrorFt: number;
  regressionFraction: number;
}

export interface OperationalTwinTrajectoryQualityGraduationReport {
  version: typeof OPERATIONAL_TWIN_TRAJECTORY_QUALITY_GRADUATION_VERSION;
  generatedAt: string;
  decision: OperationalTwinTrajectoryQualityGraduationDecision;
  reasons: OperationalTwinTrajectoryQualityGraduationReason[];
  complete: boolean;
  thresholds: typeof OPERATIONAL_TWIN_TRAJECTORY_QUALITY_GRADUATION_THRESHOLDS;
  outcomeVersion: string;
  outcomeDecision: OperationalTwinTrajectoryQualityOutcomeReport["decision"];
  truthSource: OperationalTwinTrajectoryQualityOutcomeReport["truthSource"];
  autoPromotion: false;
  manualPromotionEligible: boolean;
  canonicalTrajectoryRemainsActive: true;
  evidence: {
    spanMinutes: number;
    pairedSamples: number;
    horizonPairedSamples: Record<string, number>;
    truthCoverage: number | null;
    canonicalMeanAbsoluteErrorFt: number | null;
    qualityMeanAbsoluteErrorFt: number | null;
    relativeMaeImprovement: number | null;
    qualityWinRate: number | null;
    horizonRegressions: OperationalTwinTrajectoryQualityRegression[];
    phaseRegressions: OperationalTwinTrajectoryQualityRegression[];
  };
}

function regressionForSlice(
  key: string,
  slice: OperationalTwinTrajectoryQualityOutcomeSlice,
  maximumRegressionFraction: number,
  minimumSamples = 1,
): OperationalTwinTrajectoryQualityRegression | null {
  if (slice.pairedSamples < minimumSamples) return null;
  if (
    slice.canonicalMeanAbsoluteErrorFt === null
    || slice.qualityMeanAbsoluteErrorFt === null
    || slice.canonicalMeanAbsoluteErrorFt <= 0
  ) return null;

  const regressionFraction =
    (slice.qualityMeanAbsoluteErrorFt - slice.canonicalMeanAbsoluteErrorFt)
    / slice.canonicalMeanAbsoluteErrorFt;
  if (regressionFraction <= maximumRegressionFraction) return null;

  return {
    key,
    pairedSamples: slice.pairedSamples,
    canonicalMeanAbsoluteErrorFt: slice.canonicalMeanAbsoluteErrorFt,
    qualityMeanAbsoluteErrorFt: slice.qualityMeanAbsoluteErrorFt,
    regressionFraction: Number(regressionFraction.toFixed(4)),
  };
}

export function buildOperationalTwinTrajectoryQualityGraduation(
  outcome: OperationalTwinTrajectoryQualityOutcomeReport,
): OperationalTwinTrajectoryQualityGraduationReport {
  const reasons: OperationalTwinTrajectoryQualityGraduationReason[] = [];
  const horizonPairedSamples = Object.fromEntries(
    outcome.horizonsMinutes.map((horizon) => [
      String(horizon),
      outcome.horizons[String(horizon)]?.pairedSamples ?? 0,
    ]),
  );

  if (outcome.window.spanMinutes < OPERATIONAL_TWIN_TRAJECTORY_QUALITY_GRADUATION_THRESHOLDS.minimumSpanMinutes) {
    reasons.push("span_insufficient");
  }
  if (outcome.overall.pairedSamples < OPERATIONAL_TWIN_TRAJECTORY_QUALITY_GRADUATION_THRESHOLDS.minimumPairedSamples) {
    reasons.push("paired_samples_insufficient");
  }
  if (outcome.horizonsMinutes.some((horizon) =>
    (outcome.horizons[String(horizon)]?.pairedSamples ?? 0)
      < OPERATIONAL_TWIN_TRAJECTORY_QUALITY_GRADUATION_THRESHOLDS.minimumPairedSamplesPerHorizon
  )) {
    reasons.push("horizon_samples_insufficient");
  }
  if (
    outcome.truthCoverage === null
    || outcome.truthCoverage < OPERATIONAL_TWIN_TRAJECTORY_QUALITY_GRADUATION_THRESHOLDS.minimumTruthCoverage
  ) {
    reasons.push("truth_coverage_insufficient");
  }

  const evidenceComplete = reasons.length === 0;
  const horizonRegressions = outcome.horizonsMinutes
    .map((horizon) => regressionForSlice(
      String(horizon),
      outcome.horizons[String(horizon)]!,
      OPERATIONAL_TWIN_TRAJECTORY_QUALITY_GRADUATION_THRESHOLDS.maximumHorizonRegressionFraction,
      OPERATIONAL_TWIN_TRAJECTORY_QUALITY_GRADUATION_THRESHOLDS.minimumPairedSamplesPerHorizon,
    ))
    .filter((value): value is OperationalTwinTrajectoryQualityRegression => value !== null);

  const guardedPhases = Object.entries(outcome.phases) as Array<
    [OperationalTwinTrajectoryPhase, OperationalTwinTrajectoryQualityOutcomeSlice]
  >;
  const phaseRegressions = guardedPhases
    .map(([phase, slice]) => regressionForSlice(
      phase,
      slice,
      OPERATIONAL_TWIN_TRAJECTORY_QUALITY_GRADUATION_THRESHOLDS.maximumPhaseRegressionFraction,
      OPERATIONAL_TWIN_TRAJECTORY_QUALITY_GRADUATION_THRESHOLDS.minimumPhaseSamplesForGuard,
    ))
    .filter((value): value is OperationalTwinTrajectoryQualityRegression => value !== null);

  if (evidenceComplete) {
    if (outcome.decision !== "PASS") reasons.push("outcome_validation_not_pass");
    if (
      outcome.overall.relativeMaeImprovement === null
      || outcome.overall.relativeMaeImprovement
        < OPERATIONAL_TWIN_TRAJECTORY_QUALITY_GRADUATION_THRESHOLDS.minimumRelativeMaeImprovement
    ) {
      reasons.push("relative_mae_improvement_below_graduation");
    }
    if (
      outcome.overall.qualityWinRate === null
      || outcome.overall.qualityWinRate
        < OPERATIONAL_TWIN_TRAJECTORY_QUALITY_GRADUATION_THRESHOLDS.minimumQualityWinRate
    ) {
      reasons.push("quality_win_rate_below_graduation");
    }
    if (horizonRegressions.length > 0) reasons.push("horizon_regression");
    if (phaseRegressions.length > 0) reasons.push("phase_regression");
  }

  const decision: OperationalTwinTrajectoryQualityGraduationDecision = !evidenceComplete
    ? "WAIT"
    : reasons.length > 0
      ? "FAIL"
      : "PASS";

  return {
    version: OPERATIONAL_TWIN_TRAJECTORY_QUALITY_GRADUATION_VERSION,
    generatedAt: outcome.generatedAt,
    decision,
    reasons,
    complete: evidenceComplete,
    thresholds: OPERATIONAL_TWIN_TRAJECTORY_QUALITY_GRADUATION_THRESHOLDS,
    outcomeVersion: outcome.version,
    outcomeDecision: outcome.decision,
    truthSource: outcome.truthSource,
    autoPromotion: false,
    manualPromotionEligible: decision === "PASS",
    canonicalTrajectoryRemainsActive: true,
    evidence: {
      spanMinutes: outcome.window.spanMinutes,
      pairedSamples: outcome.overall.pairedSamples,
      horizonPairedSamples,
      truthCoverage: outcome.truthCoverage,
      canonicalMeanAbsoluteErrorFt: outcome.overall.canonicalMeanAbsoluteErrorFt,
      qualityMeanAbsoluteErrorFt: outcome.overall.qualityMeanAbsoluteErrorFt,
      relativeMaeImprovement: outcome.overall.relativeMaeImprovement,
      qualityWinRate: outcome.overall.qualityWinRate,
      horizonRegressions,
      phaseRegressions,
    },
  };
}
