import type {
  OperationalTwinTrajectoryQualityOutcomeV2Report,
  OperationalTwinTrajectoryQualityOutcomeV2Slice,
} from "./trajectory-quality-outcome-v2";

export const OPERATIONAL_TWIN_TRAJECTORY_QUALITY_V3_GRADUATION_VERSION =
  "operational-digital-twin-trajectory-quality-v3-graduation-v1" as const;

export const OPERATIONAL_TWIN_TRAJECTORY_QUALITY_V3_GRADUATION_THRESHOLDS = {
  version: OPERATIONAL_TWIN_TRAJECTORY_QUALITY_V3_GRADUATION_VERSION,
  minimumSpanMinutes: 240,
  minimumPairedSamples: 120,
  minimumPairedSamplesPerHorizon: 24,
  minimumTruthCoverage: 0.75,
  minimumRelativeMaeImprovementVsV2: 0.05,
  minimumV3WinRateVsV2: 0.55,
  minimumRelativeMaeImprovementVsCanonical: 0.08,
  maximumHorizonRegressionFractionVsV2: 0.04,
  minimumPhaseSamplesForGuard: 12,
  maximumPhaseRegressionFractionVsV2: 0.06,
  minimumPerformanceClassSamplesForGuard: 12,
  maximumPerformanceClassRegressionFractionVsV2: 0.08,
  minimumV3ProfileSamplesForGuard: 12,
  maximumV3ProfileRegressionFractionVsV2: 0.08,
} as const;

export type OperationalTwinTrajectoryQualityV3GraduationDecision = "PASS" | "WAIT" | "FAIL";

export type OperationalTwinTrajectoryQualityV3GraduationReason =
  | "span_insufficient"
  | "paired_samples_insufficient"
  | "horizon_samples_insufficient"
  | "truth_coverage_insufficient"
  | "outcome_validation_not_pass"
  | "v3_relative_mae_improvement_vs_v2_below_graduation"
  | "v3_win_rate_vs_v2_below_graduation"
  | "v3_relative_mae_improvement_vs_canonical_below_graduation"
  | "v3_horizon_regression_vs_v2"
  | "v3_phase_regression_vs_v2"
  | "v3_performance_class_regression_vs_v2"
  | "v3_profile_regression_vs_v2";

export interface OperationalTwinTrajectoryQualityV3Regression {
  key: string;
  pairedSamples: number;
  v2MeanAbsoluteErrorFt: number;
  v3MeanAbsoluteErrorFt: number;
  regressionFractionVsV2: number;
}

export interface OperationalTwinTrajectoryQualityV3GraduationReport {
  version: typeof OPERATIONAL_TWIN_TRAJECTORY_QUALITY_V3_GRADUATION_VERSION;
  generatedAt: string;
  decision: OperationalTwinTrajectoryQualityV3GraduationDecision;
  reasons: OperationalTwinTrajectoryQualityV3GraduationReason[];
  complete: boolean;
  thresholds: typeof OPERATIONAL_TWIN_TRAJECTORY_QUALITY_V3_GRADUATION_THRESHOLDS;
  outcomeVersion: string;
  outcomeDecision: OperationalTwinTrajectoryQualityOutcomeV2Report["decision"];
  truthSource: OperationalTwinTrajectoryQualityOutcomeV2Report["truthSource"];
  autoPromotion: false;
  manualPromotionEligible: boolean;
  v3PromotionImplemented: false;
  v2PromotionRemainsIndependent: true;
  canonicalTrajectoryRemainsAvailable: true;
  evidence: {
    spanMinutes: number;
    pairedSamples: number;
    horizonPairedSamples: Record<string, number>;
    truthCoverage: number | null;
    canonicalMeanAbsoluteErrorFt: number | null;
    v2MeanAbsoluteErrorFt: number | null;
    v3MeanAbsoluteErrorFt: number | null;
    v3RelativeMaeImprovementVsV2: number | null;
    v3RelativeMaeImprovementVsCanonical: number | null;
    v3WinRateVsV2: number | null;
    bestMeanAbsoluteErrorModel: OperationalTwinTrajectoryQualityOutcomeV2Slice["bestMeanAbsoluteErrorModel"];
    horizonRegressions: OperationalTwinTrajectoryQualityV3Regression[];
    phaseRegressions: OperationalTwinTrajectoryQualityV3Regression[];
    performanceClassRegressions: OperationalTwinTrajectoryQualityV3Regression[];
    v3ProfileRegressions: OperationalTwinTrajectoryQualityV3Regression[];
  };
}

function regressionForSlice(
  key: string,
  slice: OperationalTwinTrajectoryQualityOutcomeV2Slice,
  maximumRegressionFraction: number,
  minimumSamples: number,
): OperationalTwinTrajectoryQualityV3Regression | null {
  if (slice.pairedSamples < minimumSamples) return null;
  if (
    slice.v2MeanAbsoluteErrorFt === null
    || slice.v3MeanAbsoluteErrorFt === null
    || slice.v2MeanAbsoluteErrorFt <= 0
  ) return null;

  const regressionFractionVsV2 =
    (slice.v3MeanAbsoluteErrorFt - slice.v2MeanAbsoluteErrorFt)
    / slice.v2MeanAbsoluteErrorFt;
  if (regressionFractionVsV2 <= maximumRegressionFraction) return null;

  return {
    key,
    pairedSamples: slice.pairedSamples,
    v2MeanAbsoluteErrorFt: slice.v2MeanAbsoluteErrorFt,
    v3MeanAbsoluteErrorFt: slice.v3MeanAbsoluteErrorFt,
    regressionFractionVsV2: Number(regressionFractionVsV2.toFixed(4)),
  };
}

function regressionsForRecord<K extends string>(
  record: Record<K, OperationalTwinTrajectoryQualityOutcomeV2Slice>,
  maximumRegressionFraction: number,
  minimumSamples: number,
): OperationalTwinTrajectoryQualityV3Regression[] {
  return (Object.entries(record) as Array<[K, OperationalTwinTrajectoryQualityOutcomeV2Slice]>)
    .map(([key, slice]) => regressionForSlice(key, slice, maximumRegressionFraction, minimumSamples))
    .filter((value): value is OperationalTwinTrajectoryQualityV3Regression => value !== null);
}

export function buildOperationalTwinTrajectoryQualityV3Graduation(
  outcome: OperationalTwinTrajectoryQualityOutcomeV2Report,
): OperationalTwinTrajectoryQualityV3GraduationReport {
  const reasons: OperationalTwinTrajectoryQualityV3GraduationReason[] = [];
  const horizonPairedSamples = Object.fromEntries(
    outcome.horizonsMinutes.map((horizon) => [
      String(horizon),
      outcome.horizons[String(horizon)]?.pairedSamples ?? 0,
    ]),
  );

  if (outcome.window.spanMinutes < OPERATIONAL_TWIN_TRAJECTORY_QUALITY_V3_GRADUATION_THRESHOLDS.minimumSpanMinutes) {
    reasons.push("span_insufficient");
  }
  if (outcome.overall.pairedSamples < OPERATIONAL_TWIN_TRAJECTORY_QUALITY_V3_GRADUATION_THRESHOLDS.minimumPairedSamples) {
    reasons.push("paired_samples_insufficient");
  }
  if (outcome.horizonsMinutes.some((horizon) =>
    (outcome.horizons[String(horizon)]?.pairedSamples ?? 0)
      < OPERATIONAL_TWIN_TRAJECTORY_QUALITY_V3_GRADUATION_THRESHOLDS.minimumPairedSamplesPerHorizon
  )) {
    reasons.push("horizon_samples_insufficient");
  }
  if (
    outcome.truthCoverage === null
    || outcome.truthCoverage < OPERATIONAL_TWIN_TRAJECTORY_QUALITY_V3_GRADUATION_THRESHOLDS.minimumTruthCoverage
  ) {
    reasons.push("truth_coverage_insufficient");
  }

  const evidenceComplete = reasons.length === 0;

  const horizonRegressions = outcome.horizonsMinutes
    .map((horizon) => regressionForSlice(
      String(horizon),
      outcome.horizons[String(horizon)]!,
      OPERATIONAL_TWIN_TRAJECTORY_QUALITY_V3_GRADUATION_THRESHOLDS.maximumHorizonRegressionFractionVsV2,
      OPERATIONAL_TWIN_TRAJECTORY_QUALITY_V3_GRADUATION_THRESHOLDS.minimumPairedSamplesPerHorizon,
    ))
    .filter((value): value is OperationalTwinTrajectoryQualityV3Regression => value !== null);

  const phaseRegressions = regressionsForRecord(
    outcome.phases,
    OPERATIONAL_TWIN_TRAJECTORY_QUALITY_V3_GRADUATION_THRESHOLDS.maximumPhaseRegressionFractionVsV2,
    OPERATIONAL_TWIN_TRAJECTORY_QUALITY_V3_GRADUATION_THRESHOLDS.minimumPhaseSamplesForGuard,
  );

  const performanceClassRegressions = regressionsForRecord(
    outcome.performanceClasses,
    OPERATIONAL_TWIN_TRAJECTORY_QUALITY_V3_GRADUATION_THRESHOLDS.maximumPerformanceClassRegressionFractionVsV2,
    OPERATIONAL_TWIN_TRAJECTORY_QUALITY_V3_GRADUATION_THRESHOLDS.minimumPerformanceClassSamplesForGuard,
  );

  const v3ProfileRegressions = regressionsForRecord(
    outcome.v3Profiles,
    OPERATIONAL_TWIN_TRAJECTORY_QUALITY_V3_GRADUATION_THRESHOLDS.maximumV3ProfileRegressionFractionVsV2,
    OPERATIONAL_TWIN_TRAJECTORY_QUALITY_V3_GRADUATION_THRESHOLDS.minimumV3ProfileSamplesForGuard,
  );

  if (evidenceComplete) {
    if (outcome.decision !== "PASS") reasons.push("outcome_validation_not_pass");
    if (
      outcome.overall.v3RelativeMaeImprovementVsV2 === null
      || outcome.overall.v3RelativeMaeImprovementVsV2
        < OPERATIONAL_TWIN_TRAJECTORY_QUALITY_V3_GRADUATION_THRESHOLDS.minimumRelativeMaeImprovementVsV2
    ) {
      reasons.push("v3_relative_mae_improvement_vs_v2_below_graduation");
    }
    if (
      outcome.overall.v3WinRateVsV2 === null
      || outcome.overall.v3WinRateVsV2
        < OPERATIONAL_TWIN_TRAJECTORY_QUALITY_V3_GRADUATION_THRESHOLDS.minimumV3WinRateVsV2
    ) {
      reasons.push("v3_win_rate_vs_v2_below_graduation");
    }
    if (
      outcome.overall.v3RelativeMaeImprovementVsCanonical === null
      || outcome.overall.v3RelativeMaeImprovementVsCanonical
        < OPERATIONAL_TWIN_TRAJECTORY_QUALITY_V3_GRADUATION_THRESHOLDS.minimumRelativeMaeImprovementVsCanonical
    ) {
      reasons.push("v3_relative_mae_improvement_vs_canonical_below_graduation");
    }
    if (horizonRegressions.length) reasons.push("v3_horizon_regression_vs_v2");
    if (phaseRegressions.length) reasons.push("v3_phase_regression_vs_v2");
    if (performanceClassRegressions.length) reasons.push("v3_performance_class_regression_vs_v2");
    if (v3ProfileRegressions.length) reasons.push("v3_profile_regression_vs_v2");
  }

  const decision: OperationalTwinTrajectoryQualityV3GraduationDecision = !evidenceComplete
    ? "WAIT"
    : reasons.length
      ? "FAIL"
      : "PASS";

  return {
    version: OPERATIONAL_TWIN_TRAJECTORY_QUALITY_V3_GRADUATION_VERSION,
    generatedAt: outcome.generatedAt,
    decision,
    reasons,
    complete: evidenceComplete,
    thresholds: OPERATIONAL_TWIN_TRAJECTORY_QUALITY_V3_GRADUATION_THRESHOLDS,
    outcomeVersion: outcome.version,
    outcomeDecision: outcome.decision,
    truthSource: outcome.truthSource,
    autoPromotion: false,
    manualPromotionEligible: decision === "PASS",
    v3PromotionImplemented: false,
    v2PromotionRemainsIndependent: true,
    canonicalTrajectoryRemainsAvailable: true,
    evidence: {
      spanMinutes: outcome.window.spanMinutes,
      pairedSamples: outcome.overall.pairedSamples,
      horizonPairedSamples,
      truthCoverage: outcome.truthCoverage,
      canonicalMeanAbsoluteErrorFt: outcome.overall.canonicalMeanAbsoluteErrorFt,
      v2MeanAbsoluteErrorFt: outcome.overall.v2MeanAbsoluteErrorFt,
      v3MeanAbsoluteErrorFt: outcome.overall.v3MeanAbsoluteErrorFt,
      v3RelativeMaeImprovementVsV2: outcome.overall.v3RelativeMaeImprovementVsV2,
      v3RelativeMaeImprovementVsCanonical: outcome.overall.v3RelativeMaeImprovementVsCanonical,
      v3WinRateVsV2: outcome.overall.v3WinRateVsV2,
      bestMeanAbsoluteErrorModel: outcome.overall.bestMeanAbsoluteErrorModel,
      horizonRegressions,
      phaseRegressions,
      performanceClassRegressions,
      v3ProfileRegressions,
    },
  };
}
