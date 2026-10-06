"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { AircraftOperationalFocusOutcomeReport } from "@/lib/operational-twin/aircraft-operational-focus-outcome";
import type {
  OperationalTwinEventOutcomeReport,
  OperationalTwinOutcomeReport,
  OperationalTwinTruthFirstReport,
  OperationalTwinTrajectoryQualityGraduationReport,
  OperationalTwinTrajectoryQualityOutcomeReport,
  OperationalTwinWindTimingGraduationReport,
  RegionalAttentionOutcomeReport,
  RegionalAttentionGraduationReport,
} from "@/lib/operational-twin";
import { StatusBadge } from "@/components/ui-primitives";
import { formatDateTime, formatNumber, t } from "@/lib/i18n";
import styles from "./digital-twin-calibration-center.module.css";

type PersistenceStatus = {
  storage: string;
  loaded: boolean;
  databaseAvailable: boolean;
  hydratedOutcomeBuckets: number;
  hydratedEventOutcomeBuckets: number;
  hydratedTrajectoryQualityOutcomeBuckets: number;
  hydratedRegionalAttentionOutcomeBuckets: number;
  trackedPersistedBuckets: number;
  rowsWritten: number;
  rowsDeleted: number;
  loadFailures: number;
  flushFailures: number;
  lastLoadAt: string | null;
  lastFlushAt: string | null;
};

type CalibrationCenterReport = {
  version: "digital-twin-calibration-center-v1";
  generatedAt: string;
  corridor: OperationalTwinOutcomeReport;
  trajectoryQuality: OperationalTwinTrajectoryQualityOutcomeReport;
  trajectoryQualityGraduation: OperationalTwinTrajectoryQualityGraduationReport;
  event: OperationalTwinEventOutcomeReport;
  focus: AircraftOperationalFocusOutcomeReport;
  truthFirst: OperationalTwinTruthFirstReport;
  windTiming: OperationalTwinWindTimingGraduationReport;
  regionalAttention: RegionalAttentionOutcomeReport;
  regionalAttentionGraduation: RegionalAttentionGraduationReport;
  persistence: PersistenceStatus;
};

type LoadState = "loading" | "ready" | "unauthorized" | "error";

function decisionVariant(decision: "PASS" | "WAIT" | "FAIL") {
  return decision === "PASS" ? "live" : decision === "FAIL" ? "danger" : "warning";
}

function pct(value: number | null): string {
  return value === null ? t.common.emptyValue : `${formatNumber(value * 100, 1, t.locale)}%`;
}

function metricNumber(value: number | null, digits = 1): string {
  return value === null ? t.common.emptyValue : formatNumber(value, digits, t.locale);
}

function seconds(value: number | null): string {
  return value === null ? t.common.emptyValue : `${formatNumber(Math.round(value), 0, t.locale)} s`;
}

function timestamp(value: string | null): string {
  return value ? formatDateTime(value, t) : t.common.emptyValue;
}

function reasonLabel(reason: string): string {
  return t.calibrationCenter.reasons[reason as keyof typeof t.calibrationCenter.reasons] ?? reason;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <span className={styles.metric}>
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}

function DecisionHeader({
  title,
  decision,
  reasons,
}: {
  title: string;
  decision: "PASS" | "WAIT" | "FAIL";
  reasons: readonly string[];
}) {
  return (
    <div className={styles.cardHeader}>
      <div>
        <h2>{title}</h2>
        <small>{reasons.length ? reasons.map(reasonLabel).join(" · ") : t.calibrationCenter.thresholdsSatisfied}</small>
      </div>
      <StatusBadge variant={decisionVariant(decision)}>{decision}</StatusBadge>
    </div>
  );
}

export function DigitalTwinCalibrationCenter() {
  const [report, setReport] = useState<CalibrationCenterReport | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  const reload = useCallback(async () => {
    setState((current) => current === "ready" ? current : "loading");
    try {
      const response = await fetch("/api/admin/operational-twin/calibration", { cache: "no-store" });
      if (response.status === 401) {
        setReport(null);
        setState("unauthorized");
        return;
      }
      if (!response.ok) throw new Error(`Calibration Center request failed: ${response.status}`);
      setReport(await response.json() as CalibrationCenterReport);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (state === "unauthorized") {
    return (
      <main className="history-page" data-testid="digital-twin-calibration-center">
        <header className="history-page-header">
          <div>
            <h1>{t.calibrationCenter.title}</h1>
            <p className="statistics-subtitle">{t.calibrationCenter.subtitle}</p>
          </div>
        </header>
        <section className="statistics-card">
          <h2>{t.calibrationCenter.adminRequiredTitle}</h2>
          <p>{t.calibrationCenter.adminRequiredBody}</p>
          <Link className="primary-button" href="/watchlist">{t.calibrationCenter.signIn}</Link>
        </section>
      </main>
    );
  }

  return (
    <main
      className="history-page"
      data-testid="digital-twin-calibration-center"
      aria-busy={state === "loading"}
    >
      <header className="history-page-header">
        <div>
          <h1>Digital Twin Calibration Center</h1>
          <p className="statistics-subtitle">
            {t.calibrationCenter.subtitle}
          </p>
        </div>
        <button className="secondary-button" type="button" onClick={() => void reload()}>
          {t.calibrationCenter.refresh}
        </button>
      </header>

      {state === "loading" && !report ? <p>{t.calibrationCenter.loading}</p> : null}
      {state === "error" ? <p role="alert">{t.calibrationCenter.unavailable}</p> : null}

      {report ? (
        <>
          <div className={styles.summary}>
            <Metric label={t.calibrationCenter.generated} value={timestamp(report.generatedAt)} />
            <Metric label={t.calibrationCenter.persistence} value={report.persistence.databaseAvailable ? t.calibrationCenter.postgresql : t.common.unavailable} />
            <Metric label={t.calibrationCenter.persistedBuckets} value={report.persistence.trackedPersistedBuckets} />
            <Metric
              label={t.calibrationCenter.persistenceFailures}
              value={report.persistence.loadFailures + report.persistence.flushFailures}
            />
          </div>

          <div className={styles.grid}>
            <section className="statistics-card" data-testid="calibration-corridor-outcome">
              <DecisionHeader
                title={t.calibrationCenter.corridorOutcome}
                decision={report.corridor.decision}
                reasons={report.corridor.reasons}
              />
              <div className={styles.metrics}>
                <Metric label={t.calibrationCenter.samples} value={report.corridor.overall.samples} />
                <Metric label={t.calibrationCenter.uncertaintyCoverage} value={pct(report.corridor.overall.uncertaintyCoverage)} />
                <Metric
                  label={t.calibrationCenter.errorToUncertainty}
                  value={metricNumber(report.corridor.overall.meanErrorToUncertaintyRatio, 2)}
                />
                <Metric label={t.calibrationCenter.expiredTruth} value={pct(report.corridor.expiredTruthRate)} />
              </div>
              <small>{t.calibrationCenter.corridorFootnote}</small>
            </section>

            <section className="statistics-card" data-testid="calibration-trajectory-quality-outcome">
              <DecisionHeader
                title={t.calibrationCenter.trajectoryQualityOutcome}
                decision={report.trajectoryQuality.decision}
                reasons={report.trajectoryQuality.reasons}
              />
              <div className={styles.metrics}>
                <Metric label={t.calibrationCenter.pairedSamples} value={report.trajectoryQuality.overall.pairedSamples} />
                <Metric
                  label={t.calibrationCenter.canonicalMae}
                  value={report.trajectoryQuality.overall.canonicalMeanAbsoluteErrorFt === null
                    ? t.common.emptyValue
                    : `${formatNumber(report.trajectoryQuality.overall.canonicalMeanAbsoluteErrorFt, 0, t.locale)} ft`}
                />
                <Metric
                  label={t.calibrationCenter.qualityV2Mae}
                  value={report.trajectoryQuality.overall.qualityMeanAbsoluteErrorFt === null
                    ? t.common.emptyValue
                    : `${formatNumber(report.trajectoryQuality.overall.qualityMeanAbsoluteErrorFt, 0, t.locale)} ft`}
                />
                <Metric label={t.calibrationCenter.shadowWinRate} value={pct(report.trajectoryQuality.overall.qualityWinRate)} />
                <Metric label={t.calibrationCenter.relativeMaeGain} value={pct(report.trajectoryQuality.overall.relativeMaeImprovement)} />
                <Metric label={t.calibrationCenter.truthCoverage} value={pct(report.trajectoryQuality.truthCoverage)} />
              </div>
              <div className={styles.horizonGrid}>
                {report.trajectoryQuality.horizonsMinutes.map((horizon) => {
                  const slice = report.trajectoryQuality.horizons[String(horizon)];
                  return (
                    <span className={styles.horizon} key={horizon}>
                      <strong>{horizon} {t.calibrationCenter.minuteSuffix}</strong>
                      <small>
                        {slice?.pairedSamples ?? 0} {t.calibrationCenter.pairedSamples.toLowerCase()}
                        {" · "}{slice?.qualityMeanAbsoluteErrorFt ?? t.common.emptyValue} ft
                        {" · "}{pct(slice?.qualityWinRate ?? null)}
                      </small>
                    </span>
                  );
                })}
              </div>
              <div className={styles.horizonGrid}>
                {Object.entries(report.trajectoryQuality.phases)
                  .filter(([, slice]) => slice.pairedSamples > 0)
                  .map(([phase, slice]) => (
                    <span className={styles.horizon} key={phase}>
                      <strong>{phase}</strong>
                      <small>
                        {slice.pairedSamples} {t.calibrationCenter.pairedSamples.toLowerCase()}
                        {" · "}{slice.qualityMeanAbsoluteErrorFt ?? t.common.emptyValue} ft
                        {" · "}{pct(slice.qualityWinRate)}
                      </small>
                    </span>
                  ))}
              </div>
              <small>{t.calibrationCenter.trajectoryQualityFootnote}</small>
            </section>

            <section className="statistics-card" data-testid="calibration-trajectory-quality-graduation">
              <DecisionHeader
                title={t.calibrationCenter.trajectoryQualityGraduation}
                decision={report.trajectoryQualityGraduation.decision}
                reasons={report.trajectoryQualityGraduation.reasons}
              />
              <div className={styles.metrics}>
                <Metric
                  label={t.calibrationCenter.pairedSamples}
                  value={report.trajectoryQualityGraduation.evidence.pairedSamples}
                />
                <Metric
                  label={t.calibrationCenter.canonicalMae}
                  value={report.trajectoryQualityGraduation.evidence.canonicalMeanAbsoluteErrorFt === null
                    ? t.common.emptyValue
                    : `${formatNumber(report.trajectoryQualityGraduation.evidence.canonicalMeanAbsoluteErrorFt, 0, t.locale)} ft`}
                />
                <Metric
                  label={t.calibrationCenter.qualityV2Mae}
                  value={report.trajectoryQualityGraduation.evidence.qualityMeanAbsoluteErrorFt === null
                    ? t.common.emptyValue
                    : `${formatNumber(report.trajectoryQualityGraduation.evidence.qualityMeanAbsoluteErrorFt, 0, t.locale)} ft`}
                />
                <Metric
                  label={t.calibrationCenter.relativeMaeGain}
                  value={pct(report.trajectoryQualityGraduation.evidence.relativeMaeImprovement)}
                />
                <Metric
                  label={t.calibrationCenter.shadowWinRate}
                  value={pct(report.trajectoryQualityGraduation.evidence.qualityWinRate)}
                />
                <Metric
                  label={t.calibrationCenter.truthCoverage}
                  value={pct(report.trajectoryQualityGraduation.evidence.truthCoverage)}
                />
              </div>
              <small>
                {t.calibrationCenter.manualPromotionEligible}: {report.trajectoryQualityGraduation.manualPromotionEligible ? t.common.yes : t.common.no}
                {" · "}{t.calibrationCenter.canonicalTrajectoryActive}
                {" · "}{t.calibrationCenter.horizonRegressions}: {report.trajectoryQualityGraduation.evidence.horizonRegressions.length}
                {" · "}{t.calibrationCenter.phaseRegressions}: {report.trajectoryQualityGraduation.evidence.phaseRegressions.length}
              </small>
            </section>

            <section className="statistics-card" data-testid="calibration-event-outcome">
              <DecisionHeader
                title={t.calibrationCenter.eventOutcome}
                decision={report.event.decision}
                reasons={report.event.reasons}
              />
              <div className={styles.metrics}>
                <Metric label={t.calibrationCenter.predictions} value={report.event.overall.predictions} />
                <Metric label={t.calibrationCenter.scoreable} value={report.event.overall.scoreable} />
                <Metric label={t.calibrationCenter.precision} value={pct(report.event.overall.precision)} />
                <Metric label={t.calibrationCenter.timingMae} value={seconds(report.event.overall.meanAbsoluteTimingErrorSeconds)} />
              </div>
              <small>{t.calibrationCenter.eventFootnote}</small>
            </section>

            <section className="statistics-card" data-testid="calibration-focus-outcome">
              <DecisionHeader
                title={t.calibrationCenter.focusOutcome}
                decision={report.focus.decision}
                reasons={report.focus.reasons}
              />
              <div className={styles.metrics}>
                <Metric label={t.calibrationCenter.predictions} value={report.focus.overall.predictions} />
                <Metric label={t.calibrationCenter.scoreable} value={report.focus.overall.scoreable} />
                <Metric label={t.calibrationCenter.precision} value={pct(report.focus.overall.precision)} />
                <Metric label={t.calibrationCenter.timingMae} value={seconds(report.focus.overall.meanAbsoluteTimingErrorSeconds)} />
                <Metric label={t.calibrationCenter.expiredTruth} value={pct(report.focus.overall.missingTruthRate)} />
                <Metric
                  label={t.calibrationCenter.focusUnscored}
                  value={Object.values(report.focus.byType).reduce((sum, item) => sum + item.unscoredCaptures, 0)}
                />
              </div>
              <small>{t.calibrationCenter.focusFootnote}</small>
            </section>

            <section className="statistics-card" data-testid="calibration-truth-first">
              <DecisionHeader
                title={t.calibrationCenter.truthFirstRecall}
                decision={report.truthFirst.decision}
                reasons={report.truthFirst.reasons}
              />
              <div className={styles.metrics}>
                <Metric label={t.calibrationCenter.truthEvents} value={report.truthFirst.overall.truthEvents} />
                <Metric label={t.calibrationCenter.recalled} value={report.truthFirst.overall.predictedTruthEvents} />
                <Metric label={t.calibrationCenter.recall} value={pct(report.truthFirst.overall.recall)} />
                <Metric label={t.calibrationCenter.timingMae} value={seconds(report.truthFirst.overall.meanAbsoluteTimingErrorSeconds)} />
              </div>
              <small>{t.calibrationCenter.truthFirstFootnote}</small>
            </section>

            <section className="statistics-card" data-testid="calibration-wind-timing">
              <DecisionHeader
                title={t.calibrationCenter.windTimingGraduation}
                decision={report.windTiming.decision}
                reasons={report.windTiming.reasons}
              />
              <div className={styles.metrics}>
                <Metric label={t.calibrationCenter.pairedSamples} value={report.windTiming.pairedSamples} />
                <Metric label={t.calibrationCenter.truthCoverage} value={pct(report.windTiming.truthCoverage)} />
                <Metric label={t.calibrationCenter.shadowWinRate} value={pct(report.windTiming.shadowWinRate)} />
                <Metric label={t.calibrationCenter.relativeMaeGain} value={pct(report.windTiming.relativeMaeImprovement)} />
              </div>
              <small>
                {t.calibrationCenter.manualPromotionEligible}: {report.windTiming.manualPromotionEligible ? t.common.yes : t.common.no}
              </small>
            </section>

            <section className="statistics-card" data-testid="calibration-regional-attention">
              <DecisionHeader
                title={t.calibrationCenter.regionalAttentionOutcome}
                decision={report.regionalAttention.decision}
                reasons={report.regionalAttention.reasons}
              />
              <div className={styles.metrics}>
                <Metric label={t.calibrationCenter.predictions} value={report.regionalAttention.overall.predictions} />
                <Metric label={t.calibrationCenter.scoreable} value={report.regionalAttention.overall.scoreable} />
                <Metric label={t.calibrationCenter.precision} value={pct(report.regionalAttention.overall.precision)} />
                <Metric
                  label={t.calibrationCenter.truthCoverage}
                  value={pct(report.regionalAttention.overall.truthCoverage)}
                />
                <Metric
                  label={t.calibrationCenter.timingMae}
                  value={seconds(report.regionalAttention.overall.meanAbsoluteTimingErrorSeconds)}
                />
                <Metric
                  label={t.calibrationCenter.destinationClustersUnscored}
                  value={report.regionalAttention.unscoredDestinationClusters}
                />
              </div>
              <div className={styles.horizonGrid}>
                {report.regionalAttention.horizonsMinutes.map((horizon) => {
                  const slice = report.regionalAttention.horizons[String(horizon)];
                  return (
                    <span className={styles.horizon} key={horizon}>
                      <strong>{horizon} {t.calibrationCenter.minuteSuffix}</strong>
                      <small>{slice?.scoreable ?? 0} {t.calibrationCenter.scoreable.toLowerCase()} · {pct(slice?.precision ?? null)}</small>
                    </span>
                  );
                })}
              </div>
            </section>

            <section className="statistics-card" data-testid="calibration-regional-attention-graduation">
              <DecisionHeader
                title={t.calibrationCenter.regionalAttentionGraduation}
                decision={report.regionalAttentionGraduation.decision}
                reasons={report.regionalAttentionGraduation.reasons}
              />
              <div className={styles.metrics}>
                <Metric
                  label={t.calibrationCenter.scoreableEvidence}
                  value={report.regionalAttentionGraduation.evidence.scoreableSamples}
                />
                <Metric
                  label={t.calibrationCenter.precision}
                  value={pct(report.regionalAttentionGraduation.evidence.precision)}
                />
                <Metric
                  label={t.calibrationCenter.truthCoverage}
                  value={pct(report.regionalAttentionGraduation.evidence.truthCoverage)}
                />
                <Metric
                  label={t.calibrationCenter.timingMae}
                  value={seconds(report.regionalAttentionGraduation.evidence.meanAbsoluteTimingErrorSeconds)}
                />
              </div>
              <small>
                {t.calibrationCenter.manualPromotionEligible}: {report.regionalAttentionGraduation.manualPromotionEligible ? t.common.yes : t.common.no}
                {" · "}{t.calibrationCenter.publicSemanticsCanonical}
              </small>
            </section>

            <section className="statistics-card" data-testid="calibration-persistence">
              <div className={styles.cardHeader}>
                <div>
                  <h2>{t.calibrationCenter.calibrationPersistence}</h2>
                  <small>{report.persistence.storage}</small>
                </div>
                <StatusBadge
                  variant={
                    report.persistence.databaseAvailable
                      && report.persistence.loaded
                      && report.persistence.loadFailures + report.persistence.flushFailures === 0
                      ? "live"
                      : "warning"
                  }
                >
                  {report.persistence.databaseAvailable ? t.calibrationCenter.db : t.calibrationCenter.noDb}
                </StatusBadge>
              </div>
              <div className={styles.metrics}>
                <Metric label={t.calibrationCenter.corridorHydrated} value={report.persistence.hydratedOutcomeBuckets} />
                <Metric label={t.calibrationCenter.eventHydrated} value={report.persistence.hydratedEventOutcomeBuckets} />
                <Metric
                  label={t.calibrationCenter.trajectoryQualityHydrated}
                  value={report.persistence.hydratedTrajectoryQualityOutcomeBuckets}
                />
                <Metric
                  label={t.calibrationCenter.regionalHydrated}
                  value={report.persistence.hydratedRegionalAttentionOutcomeBuckets}
                />
                <Metric label={t.calibrationCenter.trackedBuckets} value={report.persistence.trackedPersistedBuckets} />
                <Metric label={t.calibrationCenter.rowsWritten} value={report.persistence.rowsWritten} />
                <Metric label={t.calibrationCenter.rowsDeleted} value={report.persistence.rowsDeleted} />
              </div>
              <small>
                {t.calibrationCenter.lastLoad} {timestamp(report.persistence.lastLoadAt)} · {t.calibrationCenter.lastFlush} {timestamp(report.persistence.lastFlushAt)}
              </small>
            </section>
          </div>
        </>
      ) : null}
    </main>
  );
}
